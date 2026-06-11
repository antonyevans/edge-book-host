// ChannelRegistry — the live WebSocket side of the host <-> agent protocol
// (canonical doc: docs/wire-protocol.md; frame TYPES: src/contracts.ts).
// One agent identity = one channel_id = sha256(agent_key), TOFU-locked: a
// reconnect with a different key for the same channel is rejected.
//
// Invariants:
//   - the host relays OPAQUE mailbox blobs; it never parses envelope plaintext;
//   - `from` on mailbox_deliver is stamped from the authenticated socket —
//     never trusted from the sender's payload;
//   - per-request 30s timeout returns 504 to the browser but keeps the channel;
//   - idle channels (no pair + no authed /api hit for EDGE_BOOK_IDLE_MS) get
//     stand_down and MUST NOT be reconnected by the agent.
import type { WebSocket } from "ws";
import { channelIdFromKey, randomToken, timingSafeEqual } from "./tokens.js";
import { isValidSlug, verifyHandleClaim } from "./handles.js";
import type { HandleClaimErrFrame } from "./contracts.js";
import type { HostStore } from "./store.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const MAX_MISSED_PONGS = 2;
const MAX_CONNECTIONS_PER_CHANNEL = 4;
// Mailbox (ea-claude-064): opaque envelope cap matches the API response cap;
// queued envelopes live this long before purge (matches the 7d idle window).
const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const MAILBOX_TTL_MS = Number(process.env.EDGE_BOOK_MAILBOX_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
// mailbox_status accepts at most this many ids per request (spec-097 §B.2).
const MAX_STATUS_IDS = 50;

// Short, non-sensitive channel handle for logs (sha256 prefix; never the key).
function cref(channel_id: string): string {
  return channel_id.slice(0, 12);
}
function logEvent(event: string, fields: Record<string, string | number>): void {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`[edge-book-host] ${event} ${parts}`);
}

export interface ApiRequest {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body_b64: string | null;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body_b64: string;
}

interface PendingRequest {
  resolve: (value: ApiResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  ws: WebSocket; // the connection this request was sent on
}

interface Connection {
  ws: WebSocket;
  missedPongs: number;
  heartbeat: NodeJS.Timeout | null;
}

interface Channel {
  channel_id: string;
  agent_key: string;
  agent_did: string | null;
  // Oldest -> newest. The most-recently-attached OPEN connection is primary.
  // Keeping a stack (instead of evicting on every attach) means a transient
  // second socket — e.g. a short-lived `edge-book pair` mint that shares the
  // agent key, hence the channel — comes and goes without orphaning the
  // persistent dial-out. (ea-claude-055)
  connections: Connection[];
  pending: Map<string, PendingRequest>;
}

export interface ChannelMetrics {
  connected_channels: number;
  mailbox_queue_depth: number;
  receipts_ledger_size: number;
  deliveries: {
    enqueued: number;
    delivered: number;
    acked: number;
    ack_rejects: number;
  };
}

export class ChannelRegistry {
  private channels = new Map<string, Channel>();
  private counters = { enqueued: 0, delivered: 0, acked: 0, ack_rejects: 0 };

  constructor(private store: HostStore) {}

  liveChannelCount(): number {
    let count = 0;
    for (const channel of this.channels.values()) {
      const hasOpen = channel.connections.some((c) => c.ws.readyState === c.ws.OPEN);
      if (hasOpen) count++;
    }
    return count;
  }

  metrics(): ChannelMetrics {
    return {
      connected_channels: this.liveChannelCount(),
      mailbox_queue_depth: this.store.mailboxCount(),
      receipts_ledger_size: this.store.receiptsCount(),
      deliveries: { ...this.counters },
    };
  }

  // A channel is "available" only if it has at least one OPEN connection.
  has(channel_id: string): boolean {
    return this.primaryConn(channel_id) !== undefined;
  }

  get(channel_id: string): Channel | undefined {
    return this.channels.get(channel_id);
  }

  connectionCount(channel_id: string): number {
    const channel = this.channels.get(channel_id);
    if (!channel) return 0;
    return channel.connections.filter((c) => c.ws.readyState === c.ws.OPEN).length;
  }

  // Register a dial-out. Enforces TOFU: a channel's agent_key is fixed for the
  // lifetime of host state — reconnects with a different key are rejected.
  // Does NOT evict existing connections; the new socket joins the stack and
  // becomes primary. Prior connections remain as live fallbacks.
  attach(ws: WebSocket, agent_key: string, agent_did: string | null, remote = "?"): { ok: true; channel_id: string } | { ok: false; error: string } {
    const channel_id = channelIdFromKey(agent_key);
    const recorded = this.store.channelKey(channel_id);
    if (recorded && !timingSafeEqual(recorded, agent_key)) {
      logEvent("agent_reject", { channel: cref(channel_id), reason: "agent_key_mismatch", remote });
      return { ok: false, error: "agent_key_mismatch" };
    }
    let channel = this.channels.get(channel_id);
    if (!channel) {
      channel = { channel_id, agent_key, agent_did, connections: [], pending: new Map() };
      this.channels.set(channel_id, channel);
    } else if (agent_did) {
      channel.agent_did = agent_did;
    }
    // Drop any connections the kernel/heartbeat has already closed.
    this.pruneClosed(channel);
    // Bound the stack: if full, evict the oldest still-open connection.
    while (channel.connections.length >= MAX_CONNECTIONS_PER_CHANNEL) {
      const oldest = channel.connections.shift();
      if (oldest) this.teardownConnection(channel, oldest, "evicted_stack_full");
    }
    const now = Date.now();
    this.store.recordChannel({
      channel_id,
      agent_key,
      agent_did: channel.agent_did,
      first_seen_at: now,
      last_seen_at: now
    });
    const conn: Connection = { ws, missedPongs: 0, heartbeat: null };
    channel.connections.push(conn);
    this.startHeartbeat(channel, conn);
    logEvent("agent_attach", {
      channel: cref(channel_id),
      tofu: recorded ? "known" : "new",
      conns: channel.connections.length,
      remote
    });
    return { ok: true, channel_id };
  }

  // Remove a single connection (identified by its socket). The channel survives
  // as long as any other connection remains; it is deleted only when the last
  // connection goes.
  detachConnection(channel_id: string, ws: WebSocket, reason: string): void {
    const channel = this.channels.get(channel_id);
    if (!channel) return;
    const idx = channel.connections.findIndex((c) => c.ws === ws);
    if (idx === -1) return;
    const [conn] = channel.connections.splice(idx, 1);
    if (conn?.heartbeat) clearTimeout(conn.heartbeat as NodeJS.Timeout);
    // Reject only the in-flight requests routed to THIS socket.
    for (const [request_id, pending] of channel.pending) {
      if (pending.ws === ws) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`channel_closed:${reason}`));
        channel.pending.delete(request_id);
      }
    }
    const remaining = channel.connections.filter((c) => c.ws.readyState === c.ws.OPEN).length;
    logEvent("agent_detach", { channel: cref(channel_id), reason, conns_remaining: remaining });
    if (channel.connections.length === 0) {
      for (const pending of channel.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`channel_closed:${reason}`));
      }
      channel.pending.clear();
      this.channels.delete(channel_id);
      logEvent("channel_empty", { channel: cref(channel_id) });
    }
  }

  // Frame an API request onto the channel's primary connection; await the
  // response correlated by request_id.
  async proxy(channel_id: string, request_id: string, req: ApiRequest): Promise<ApiResponse> {
    const channel = this.channels.get(channel_id);
    const primary = this.primaryConn(channel_id);
    if (!channel || !primary) throw new Error("agent_offline");
    const ws = primary.ws;
    return new Promise<ApiResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.pending.delete(request_id);
        reject(new Error("request_timeout"));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      channel.pending.set(request_id, { resolve, reject, timer, ws });
      const frame = JSON.stringify({
        type: "api_request",
        request_id,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body_b64: req.body_b64
      });
      try {
        ws.send(frame);
      } catch (err) {
        clearTimeout(timer);
        channel.pending.delete(request_id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // Called by the server when a frame arrives on a specific channel socket.
  handleFrame(channel_id: string, ws: WebSocket, data: unknown): void {
    const channel = this.channels.get(channel_id);
    if (!channel) return;
    if (typeof data !== "object" || data === null) return;
    const frame = data as Record<string, unknown>;
    const type = frame.type;
    if (type === "pong") {
      const conn = channel.connections.find((c) => c.ws === ws);
      if (conn) conn.missedPongs = 0;
      return;
    }
    if (type === "api_response") {
      const request_id = String(frame.request_id || "");
      const pending = channel.pending.get(request_id);
      if (!pending) return; // stale; already timed out
      channel.pending.delete(request_id);
      clearTimeout(pending.timer);
      const body_b64 = String(frame.body_b64 || "");
      if (Buffer.byteLength(body_b64, "base64") > MAX_RESPONSE_BYTES) {
        pending.reject(new Error("response_too_large"));
        return;
      }
      pending.resolve({
        status: typeof frame.status === "number" ? frame.status : 500,
        headers: (frame.headers && typeof frame.headers === "object") ? frame.headers as Record<string, string> : {},
        body_b64
      });
      return;
    }
    if (type === "pair_register") {
      const code = String(frame.code || "");
      const ttl_ms = typeof frame.ttl_ms === "number" ? frame.ttl_ms : 300_000;
      const request_id = String(frame.request_id || "");
      if (!code || ttl_ms > 600_000 || ttl_ms < 1000) {
        this.send(ws, { type: "pair_register_err", request_id, error: "invalid_pair_request" });
        return;
      }
      this.store.registerPairingCode(code, channel.channel_id, ttl_ms);
      this.send(ws, { type: "pair_register_ok", request_id, channel_id: channel.channel_id });
      return;
    }
    if (type === "sessions_revoke") {
      const request_id = String(frame.request_id || "");
      const count = this.store.revokeChannelSessions(channel.channel_id);
      this.send(ws, { type: "sessions_revoke_ok", request_id, revoked: count, channel_id: channel.channel_id });
      return;
    }
    // List this channel's remembered devices (ea-claude-057). No secret tokens.
    if (type === "sessions_list") {
      const request_id = String(frame.request_id || "");
      this.send(ws, { type: "sessions_list_ok", request_id, devices: this.store.listDevices(channel.channel_id) });
      return;
    }
    // Revoke ONE device by its public device_id, scoped to this channel.
    if (type === "session_revoke_one") {
      const request_id = String(frame.request_id || "");
      const device_id = String(frame.device_id || "");
      const revoked = device_id ? this.store.revokeDeviceById(channel.channel_id, device_id) : false;
      this.send(ws, { type: "session_revoke_one_ok", request_id, device_id, revoked });
      return;
    }
    // Mailbox send (ea-claude-064): A enqueues an opaque envelope for `to`. The
    // host stamps `from` from THIS authenticated channel — never trusts a
    // sender-supplied `from`. Blob is opaque; the host never parses it.
    if (type === "mailbox_send") {
      const request_id = String(frame.request_id || "");
      const to = String(frame.to || "");
      const blob_b64 = String(frame.blob_b64 || "");
      if (!to || !blob_b64) {
        this.send(ws, { type: "mailbox_send_err", request_id, error: "invalid_mailbox_send" });
        return;
      }
      if (Buffer.byteLength(blob_b64, "base64") > MAX_BLOB_BYTES) {
        this.send(ws, { type: "mailbox_send_err", request_id, error: "blob_too_large" });
        return;
      }
      const id = randomToken(12);
      const msg = { id, to, from: channel.channel_id, blob: blob_b64, ts: Date.now() };
      this.store.enqueueMailbox(msg, MAILBOX_TTL_MS);
      logEvent("mailbox_enqueue", { id, to: cref(to), from: cref(channel.channel_id) });
      this.counters.enqueued++;
      // Liveness answer (spec-097 §B.1, normative ordering): computed BEFORE
      // the ack is sent — deliverQueued below would race it otherwise.
      const recipient_live = this.resolveLiveChannel(to) !== undefined;
      this.send(ws, { type: "mailbox_send_ok", request_id, id, recipient_live });
      // Best-effort immediate delivery if the recipient is online. At-least-once
      // either way: the message stays queued until the recipient acks.
      this.deliverQueued(to);
      return;
    }
    // Mailbox ack (ea-claude-064): the recipient confirms it applied an envelope
    // so the host can delete it. Only the addressed recipient may ack.
    if (type === "mailbox_ack") {
      const id = String(frame.id || "");
      if (!id) return;
      // Only the addressed recipient may delete a message. Match against the
      // channel_id and any DID alias the sender used to address it.
      const recipient = this.store.peekMailboxRecipient(id);
      if (recipient && recipient !== channel.channel_id && recipient !== channel.agent_did) {
        logEvent("mailbox_ack_reject", { id, by: cref(channel.channel_id) });
        this.counters.ack_rejects++;
        return;
      }
      const deleted = this.store.ackMailbox(id);
      if (deleted) {
        logEvent("mailbox_ack", { id, to: cref(deleted) });
        this.counters.acked++;
      }
      return;
    }
    // Mailbox status (spec-097): the SENDER asks for per-message delivery state.
    // Fail closed: an id is reported only when the requesting channel's
    // channel_id equals the stored `from` (host-stamped at enqueue — never a
    // DID) — anyone else sees "unknown"; probing reveals nothing. For acked/
    // unknown, queued_ms and recipient_live are OMITTED (not null).
    if (type === "mailbox_status") {
      const request_id = String(frame.request_id || "");
      const ids = frame.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_STATUS_IDS || !ids.every((i) => typeof i === "string")) {
        this.send(ws, { type: "mailbox_status_err", request_id, error: "invalid_mailbox_status" });
        return;
      }
      const now = Date.now();
      const statuses = (ids as string[]).map((id) => {
        const queued = this.store.getMailboxMessage(id);
        if (queued && queued.from === channel.channel_id) {
          return {
            id,
            state: queued.delivered_at === undefined ? "queued" : "delivered",
            queued_ms: Math.max(0, now - queued.ts),
            recipient_live: this.resolveLiveChannel(queued.to) !== undefined
          };
        }
        const receipt = this.store.getReceipt(id);
        if (receipt && receipt.from === channel.channel_id) return { id, state: "acked" };
        return { id, state: "unknown" };
      });
      this.send(ws, { type: "mailbox_status_ok", request_id, statuses });
      return;
    }
    // Handle claim (spec-096): the agent claims a human-friendly handle, backed
    // by a self-signed card + a claim signature over {handle, agent_did,
    // claimed_at}. The host verifies the claim, persists the signed card, and
    // replies ok/err. Reasons map 1:1 to verifyHandleClaim's verdict plus the
    // slug pre-check and the store's first-come-first-served "taken".
    if (type === "handle_claim") {
      const request_id = String(frame.request_id || "");
      const handle = String(frame.handle || "");
      const claimed_at = Number(frame.claimed_at || 0);
      const claim_sig = String(frame.claim_sig || "");
      const card = frame.card as { agent_id?: string };
      if (!isValidSlug(handle)) { this.send(ws, { type: "handle_claim_err", request_id, reason: "bad_format" } satisfies HandleClaimErrFrame); return; }
      const verdict = verifyHandleClaim(card as never, handle, claimed_at, claim_sig);
      if (verdict !== "ok") { this.send(ws, { type: "handle_claim_err", request_id, reason: verdict } satisfies HandleClaimErrFrame); return; }
      const result = this.store.claimHandle({ handle, agent_did: String(card.agent_id), card, claim_sig, claimed_at });
      if (result === "taken") { this.send(ws, { type: "handle_claim_err", request_id, reason: "taken" } satisfies HandleClaimErrFrame); return; }
      logEvent("handle_claim", { handle, agent_did: cref(String(card.agent_id)) });
      this.send(ws, { type: "handle_claim_ok", request_id, handle });
      return;
    }
    // Unknown — echo back on the originating socket.
    this.send(ws, { type: "error", error: "unknown_message_type", ref: typeof type === "string" ? type : null });
  }

  // Idle stand-down: for every connected channel whose last HUMAN activity is
  // older than idleMs, tell the agent to stand down and close its connections.
  // The agent honors `stand_down` by suppressing reconnect until re-enabled or
  // re-paired (ea-claude-061). Returns the channel_ids stood down.
  sweepIdle(idleMs: number, now: number = Date.now()): string[] {
    const stoodDown: string[] = [];
    for (const channel_id of [...this.channels.keys()]) {
      const meta = this.store.getChannel(channel_id);
      // Reference point: last human activity, else first-ever connect.
      const idleSince = meta?.last_active_at ?? meta?.first_seen_at ?? now;
      if (now - idleSince <= idleMs) continue;
      const channel = this.channels.get(channel_id);
      if (!channel) continue;
      logEvent("agent_stand_down", { channel: cref(channel_id), idle_ms: now - idleSince });
      const frame = { type: "stand_down", reason: "idle_timeout", channel_id, idle_ms: now - idleSince };
      for (const conn of channel.connections) {
        this.send(conn.ws, frame);
        try { conn.ws.close(1000, "idle_timeout"); } catch { /* ignore */ }
      }
      stoodDown.push(channel_id);
    }
    return stoodDown;
  }

  // Deliver every unacked queued envelope addressed to `recipient` (a channel_id
  // or DID alias) to its primary open connection, if any. No-op when offline —
  // messages stay queued and are redelivered on the recipient's next connect.
  // At-least-once: a message is deleted only when the recipient acks it.
  deliverQueued(recipient: string): number {
    const live = this.resolveLiveChannel(recipient);
    if (!live) return 0;
    const { channel, primary } = live;
    const queued = this.store.mailboxForRecipient(channel.channel_id, channel.agent_did);
    let sent = 0;
    for (const m of queued) {
      this.send(primary.ws, { type: "mailbox_deliver", id: m.id, from: m.from, blob_b64: m.blob, ts: m.ts });
      // Stamp the FIRST push (spec-097): "delivered" = written to a live socket
      // at least once. Redelivery keeps the first stamp (markDelivered no-ops).
      this.store.markDelivered(m.id);
      sent++;
    }
    if (sent) {
      logEvent("mailbox_deliver", { channel: cref(channel.channel_id), count: sent });
      this.counters.delivered += sent;
    }
    return sent;
  }

  // Called by the server right after `hello_ok`: flush any envelopes that
  // arrived while this channel was offline.
  flushMailbox(channel_id: string): number {
    return this.deliverQueued(channel_id);
  }

  // Resolve a recipient address (channel_id or DID alias) to a live channel
  // with an OPEN primary connection. Reads the in-memory `channels` Map — the
  // only place liveness exists (the store has no liveness concept). Shared by
  // the mailbox_send liveness answer, mailbox_status, and deliverQueued
  // (spec-097). Read-only.
  private resolveLiveChannel(recipient: string): { channel: Channel; primary: Connection } | undefined {
    let channel = this.channels.get(recipient);
    if (!channel) {
      for (const c of this.channels.values()) {
        if (c.agent_did === recipient) { channel = c; break; }
      }
    }
    if (!channel) return undefined;
    const primary = this.primaryConn(channel.channel_id);
    if (!primary) return undefined;
    return { channel, primary };
  }

  // Most-recently-attached OPEN connection on a channel, if any.
  private primaryConn(channel_id: string): Connection | undefined {
    const channel = this.channels.get(channel_id);
    if (!channel) return undefined;
    for (let i = channel.connections.length - 1; i >= 0; i--) {
      const conn = channel.connections[i];
      if (conn && conn.ws.readyState === conn.ws.OPEN) return conn;
    }
    return undefined;
  }

  private pruneClosed(channel: Channel): void {
    const open: Connection[] = [];
    for (const conn of channel.connections) {
      if (conn.ws.readyState === conn.ws.OPEN || conn.ws.readyState === conn.ws.CONNECTING) {
        open.push(conn);
      } else if (conn.heartbeat) {
        clearTimeout(conn.heartbeat as NodeJS.Timeout);
      }
    }
    channel.connections = open;
  }

  private teardownConnection(channel: Channel, conn: Connection, reason: string): void {
    if (conn.heartbeat) clearTimeout(conn.heartbeat as NodeJS.Timeout);
    try { conn.ws.close(1001, reason); } catch { /* ignore */ }
    for (const [request_id, pending] of channel.pending) {
      if (pending.ws === conn.ws) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`channel_closed:${reason}`));
        channel.pending.delete(request_id);
      }
    }
  }

  private startHeartbeat(channel: Channel, conn: Connection): void {
    const interval: NodeJS.Timeout = setInterval(() => {
      if (conn.ws.readyState !== conn.ws.OPEN) {
        clearInterval(interval);
        return;
      }
      conn.missedPongs++;
      if (conn.missedPongs > MAX_MISSED_PONGS) {
        clearInterval(interval);
        logEvent("agent_heartbeat_timeout", { channel: cref(channel.channel_id), missed: conn.missedPongs });
        try { conn.ws.close(1011, "heartbeat_timeout"); } catch { /* ignore */ }
        return;
      }
      this.send(conn.ws, { type: "ping" });
    }, PING_INTERVAL_MS);
    interval.unref();
    conn.heartbeat = interval;
    conn.ws.on("close", () => clearInterval(interval));
  }

  // Push an arbitrary frame to the primary open connection for channel_id.
  // Returns true if sent, false if the channel has no live connection.
  // Used by server.ts to push pair_complete on code redemption (spec-135).
  pushFrame(channel_id: string, frame: Record<string, unknown>): boolean {
    const live = this.resolveLiveChannel(channel_id);
    if (!live) return false;
    this.send(live.primary.ws, frame);
    return true;
  }

  private send(ws: WebSocket, payload: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch { /* ignore */ }
  }
}
