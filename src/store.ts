// HostStore — all host persistence (single JSON file under DATA_DIR, written
// atomically via temp+rename). Holds: pairing codes (TTL, single-use),
// sessions, device tokens (metadata only — the token secret is hashed),
// channel meta (TOFU key per channel), the mailbox queue, and the handle
// registry (spec-096: handle -> signed AgentCard, bound to the agent DID).
//
// Invariants:
//   - mailbox is at-least-once: a message is deleted ONLY on ack by the
//     addressed recipient; everything unacked is redelivered on reconnect and
//     purged after EDGE_BOOK_MAILBOX_TTL_MS (default 7 days);
//   - a handle is grantable iff free OR already owned by the same DID
//     (idempotent re-claim); claims are signature-verified in handles.ts.
import fs from "node:fs";
import path from "node:path";
import type { MailboxMessage } from "./contracts.js";
import { logStructured, shortRef, traceRing } from "./observe.js";

// Receipts ledger bounds (spec-097): acked entries expire after the TTL
// (purged by the existing purge() sweep) and the ledger is capped at insert
// time — Record carries no order, so eviction sorts by acked_at.
const RECEIPT_TTL_MS = Number(process.env.EDGE_BOOK_RECEIPT_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
const RECEIPT_CAP = Number(process.env.EDGE_BOOK_RECEIPT_CAP) || 10_000;

export interface PairingCode {
  code: string;
  channel_id: string;
  expires_at: number;
}

export interface Session {
  session_id: string;
  channel_id: string;
  csrf_token: string;
  expires_at: number;
}

export interface DeviceToken {
  device_token: string; // secret — never surfaced to the agent/UI
  channel_id: string;
  expires_at: number;
  // Per-device metadata (ea-claude-057). device_id is a non-secret stable handle
  // the owner uses to list + selectively revoke a device.
  device_id?: string;
  label?: string;
  created_at?: number;
  last_seen_at?: number;
}

// What an agent/owner sees when listing their devices — no secret token.
export interface DeviceInfo {
  device_id: string;
  label: string;
  created_at: number;
  last_seen_at: number;
}

export interface ChannelMeta {
  channel_id: string;
  agent_key: string;
  agent_did: string | null;
  first_seen_at: number;
  last_seen_at: number;
  // Timestamp of the most recent HUMAN activity on this channel (successful pair
  // or authenticated /api/* request). Drives the idle-timeout stand-down — it is
  // NOT bumped by agent attach/heartbeat, so an agent nobody reads goes idle.
  last_active_at?: number;
}

// A queued mailbox envelope (ea-claude-064). The host stores routing metadata +
// the opaque `blob` only — never envelope plaintext. `expires_at` is a
// host-internal TTL for purge and is NOT part of the wire MailboxMessage.
export interface StoredMailboxMessage extends MailboxMessage {
  expires_at: number;
  // Epoch ms of the FIRST mailbox_deliver push (spec-097). Absent = never
  // pushed to a live socket. Host-internal — stripped from wire shapes
  // alongside expires_at. At-least-once redelivery keeps the first stamp.
  delivered_at?: number;
}

export interface HandleRecord {
  handle: string;
  agent_did: string;
  card: unknown;          // the full signed AgentCard (opaque to the host)
  claimed_at: number;
  claim_sig: string;
  discoverable?: boolean; // undefined means true (default discoverable)
}

// What survives an ack (spec-097): enough for the SENDER (`from` is the
// channel_id the host stamped at enqueue) to learn "acked", nothing more.
export interface ReceiptEntry {
  acked_at: number;
  to: string;
  from: string;
}

interface State {
  pairing_codes: Record<string, PairingCode>;
  sessions: Record<string, Session>;
  device_tokens: Record<string, DeviceToken>;
  channels: Record<string, ChannelMeta>;
  // Store-and-forward queue keyed by host-assigned message id. Survives restart.
  mailbox: Record<string, StoredMailboxMessage>;
  // Handle registry keyed by slug (spec-096). Survives restart.
  handles: Record<string, HandleRecord>;
  // Receipts ledger keyed by mailbox message id (spec-097). Survives restart.
  receipts: Record<string, ReceiptEntry>;
}

const EMPTY: State = {
  pairing_codes: {},
  sessions: {},
  device_tokens: {},
  channels: {},
  mailbox: {},
  handles: {},
  receipts: {}
};

export class HostStore {
  private state: State;
  private readonly file: string;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "state.json");
    fs.mkdirSync(dataDir, { recursive: true });
    this.state = this.load();
    this.purge();
  }

  private load(): State {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<State>;
      return {
        pairing_codes: parsed.pairing_codes || {},
        sessions: parsed.sessions || {},
        device_tokens: parsed.device_tokens || {},
        channels: parsed.channels || {},
        mailbox: parsed.mailbox || {},
        handles: parsed.handles || {},
        receipts: parsed.receipts || {}
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 200);
  }

  flushNow(): void {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.state), "utf8");
    fs.renameSync(tmp, this.file);
  }

  purge(now: number = Date.now()): void {
    for (const [k, v] of Object.entries(this.state.pairing_codes)) {
      if (v.expires_at <= now) delete this.state.pairing_codes[k];
    }
    for (const [k, v] of Object.entries(this.state.sessions)) {
      if (v.expires_at <= now) delete this.state.sessions[k];
    }
    for (const [k, v] of Object.entries(this.state.device_tokens)) {
      if (v.expires_at <= now) delete this.state.device_tokens[k];
    }
    for (const [k, v] of Object.entries(this.state.mailbox)) {
      if (v.expires_at <= now) {
        delete this.state.mailbox[k];
        logStructured("mailbox_expire", { id: v.id, to: shortRef(v.to), from: shortRef(v.from), trace_id: v.trace_id });
        if (v.trace_id) traceRing.record({ trace_id: v.trace_id, hop: "expire", id: v.id, from: shortRef(v.from), to: shortRef(v.to), ts: now });
      }
    }
    for (const [k, v] of Object.entries(this.state.receipts)) {
      if (v.acked_at + RECEIPT_TTL_MS <= now) delete this.state.receipts[k];
    }
    this.scheduleFlush();
  }

  // --- mailbox (store-and-forward; ea-claude-064) ---

  // Persist an opaque envelope for later delivery. Returns the stored message.
  enqueueMailbox(msg: MailboxMessage, ttl_ms: number): StoredMailboxMessage {
    const stored: StoredMailboxMessage = { ...msg, expires_at: Date.now() + ttl_ms };
    this.state.mailbox[msg.id] = stored;
    this.scheduleFlush();
    return stored;
  }

  // Unacked messages addressed to a recipient, oldest-first. `to` may have been
  // recorded as either the channel_id or a DID alias, so match against both.
  mailboxForRecipient(channel_id: string, agent_did: string | null, now: number = Date.now()): MailboxMessage[] {
    const out: StoredMailboxMessage[] = [];
    for (const m of Object.values(this.state.mailbox)) {
      if (m.expires_at <= now) continue;
      if (m.to === channel_id || (agent_did && m.to === agent_did)) out.push(m);
    }
    out.sort((a, b) => a.ts - b.ts);
    // Strip the host-internal fields — the wire shape is {id,to,from,blob,ts}.
    return out.map(({ expires_at: _omit, delivered_at: _omit2, ...wire }) => wire);
  }

  // Peek a queued message's recipient (`to`) without deleting it.
  peekMailboxRecipient(id: string): string | null {
    return this.state.mailbox[id]?.to ?? null;
  }

  // Peek a queued message's optional trace_id (ea-claude-138) without
  // deleting it — read BEFORE ackMailbox so the ack hop can be correlated.
  peekMailboxTrace(id: string): string | undefined {
    return this.state.mailbox[id]?.trace_id;
  }

  // Per-recipient queue depth for /admin/agents (counts both channel_id and
  // DID-alias addressing, mirroring mailboxForRecipient).
  mailboxDepthFor(channel_id: string, agent_did: string | null, now: number = Date.now()): number {
    let n = 0;
    for (const m of Object.values(this.state.mailbox)) {
      if (m.expires_at <= now) continue;
      if (m.to === channel_id || (agent_did && m.to === agent_did)) n++;
    }
    return n;
  }

  // Channel metadata snapshot for /admin/agents (admin-only; full ids).
  listChannels(): ChannelMeta[] {
    return Object.values(this.state.channels).map((c) => ({ ...c }));
  }

  // Delete a delivered+acked message. Returns the channel it was addressed to,
  // or null if unknown (idempotent — a duplicate ack is a no-op). Records the
  // receipt BEFORE the delete (spec-097) so the sender can still see "acked".
  // Caller (channels.ts mailbox_ack) has already verified the acker is the
  // addressed recipient — this method assumes an authorized ack.
  ackMailbox(id: string, now: number = Date.now()): string | null {
    const m = this.state.mailbox[id];
    if (!m) return null;
    this.state.receipts[id] = { acked_at: now, to: m.to, from: m.from };
    this.enforceReceiptCap();
    delete this.state.mailbox[id];
    this.scheduleFlush();
    return m.to;
  }

  // Stamp the FIRST delivery push (spec-097). First write wins — redelivery on
  // reconnect must not move the timestamp. Writes state.mailbox[id] directly
  // because mailboxForRecipient returns stripped wire copies.
  markDelivered(id: string, now: number = Date.now()): void {
    const m = this.state.mailbox[id];
    if (!m || m.delivered_at !== undefined) return;
    m.delivered_at = now;
    this.scheduleFlush();
  }

  // Read one queued message in its host-internal shape (mailbox_status lookups).
  // Expired-but-unswept messages are treated as gone (spec-097: "unknown"
  // includes expired) so status never outlives the TTL by purge cadence.
  getMailboxMessage(id: string, now = Date.now()): StoredMailboxMessage | null {
    const m = this.state.mailbox[id];
    if (!m || m.expires_at <= now) return null;
    return m;
  }

  getReceipt(id: string): ReceiptEntry | null {
    return this.state.receipts[id] ?? null;
  }

  receiptsCount(): number {
    return Object.keys(this.state.receipts).length;
  }

  // Cap enforcement at insert time (spec-097 §A.2): when over cap, sort by
  // acked_at ascending and delete oldest until at cap.
  private enforceReceiptCap(): void {
    if (Object.keys(this.state.receipts).length <= RECEIPT_CAP) return;
    const entries = Object.entries(this.state.receipts);
    entries.sort((a, b) => a[1].acked_at - b[1].acked_at);
    for (let i = 0; i < entries.length - RECEIPT_CAP; i++) {
      const entry = entries[i];
      if (entry) delete this.state.receipts[entry[0]];
    }
  }

  // For tests / inspection.
  mailboxCount(): number {
    return Object.keys(this.state.mailbox).length;
  }

  // --- handle registry (spec-096) ---
  // Grant iff free OR already owned by the same DID (idempotent card refresh).
  claimHandle(rec: Omit<HandleRecord, "claimed_at"> & { claimed_at?: number }): "ok" | "taken" {
    const existing = this.state.handles[rec.handle];
    if (existing && existing.agent_did !== rec.agent_did) return "taken";
    this.state.handles[rec.handle] = { ...rec, claimed_at: rec.claimed_at ?? Date.now() };
    this.scheduleFlush();
    return "ok";
  }

  resolveHandle(handle: string): HandleRecord | null {
    return Object.hasOwn(this.state.handles, handle) ? this.state.handles[handle] ?? null : null;
  }

  // Returns all discoverable handles (discoverable !== false), sorted by
  // claimed_at ascending, with offset/limit pagination. Max limit 500.
  listHandles(opts: { offset?: number; limit?: number } = {}): { handles: HandleRecord[]; total: number } {
    const all = Object.values(this.state.handles)
      .filter((r) => r.discoverable !== false)
      .sort((a, b) => a.claimed_at - b.claimed_at);
    const total = all.length;
    const offset = opts.offset ?? 0;
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    return { handles: all.slice(offset, offset + limit), total };
  }

  // --- pairing codes ---
  // Returns the authoritative host-clock deadline so the ack can carry it
  // back to the agent (ea-claude-112).
  registerPairingCode(code: string, channel_id: string, ttl_ms: number): number {
    const expires_at = Date.now() + ttl_ms;
    this.state.pairing_codes[code] = {
      code,
      channel_id,
      expires_at
    };
    this.scheduleFlush();
    return expires_at;
  }

  consumePairingCode(code: string): string | null {
    const entry = this.state.pairing_codes[code];
    if (!entry) return null;
    if (entry.expires_at <= Date.now()) {
      delete this.state.pairing_codes[code];
      this.scheduleFlush();
      return null;
    }
    delete this.state.pairing_codes[code];
    this.scheduleFlush();
    return entry.channel_id;
  }

  // --- sessions ---
  createSession(session: Session): void {
    this.state.sessions[session.session_id] = session;
    this.scheduleFlush();
  }

  getSession(session_id: string): Session | null {
    const s = this.state.sessions[session_id];
    if (!s) return null;
    if (s.expires_at <= Date.now()) {
      delete this.state.sessions[session_id];
      this.scheduleFlush();
      return null;
    }
    return s;
  }

  revokeSession(session_id: string): void {
    delete this.state.sessions[session_id];
    this.scheduleFlush();
  }

  revokeChannelSessions(channel_id: string): number {
    let count = 0;
    for (const [k, v] of Object.entries(this.state.sessions)) {
      if (v.channel_id === channel_id) {
        delete this.state.sessions[k];
        count++;
      }
    }
    for (const [k, v] of Object.entries(this.state.device_tokens)) {
      if (v.channel_id === channel_id) {
        delete this.state.device_tokens[k];
        count++;
      }
    }
    if (count) this.scheduleFlush();
    return count;
  }

  // --- device tokens ---
  createDeviceToken(token: DeviceToken): void {
    this.state.device_tokens[token.device_token] = token;
    this.scheduleFlush();
  }

  getDeviceToken(device_token: string): DeviceToken | null {
    const t = this.state.device_tokens[device_token];
    if (!t) return null;
    if (t.expires_at <= Date.now()) {
      delete this.state.device_tokens[device_token];
      this.scheduleFlush();
      return null;
    }
    return t;
  }

  // Update last-seen on device-token auto-resume (ea-claude-057).
  touchDevice(device_token: string, now: number = Date.now()): void {
    const t = this.state.device_tokens[device_token];
    if (!t) return;
    t.last_seen_at = now;
    this.scheduleFlush();
  }

  // Non-secret list of a channel's active devices, newest first (ea-claude-057).
  listDevices(channel_id: string, now: number = Date.now()): DeviceInfo[] {
    const out: DeviceInfo[] = [];
    for (const t of Object.values(this.state.device_tokens)) {
      if (t.channel_id !== channel_id || t.expires_at <= now || !t.device_id) continue;
      out.push({
        device_id: t.device_id,
        label: t.label || "device",
        created_at: t.created_at || 0,
        last_seen_at: t.last_seen_at || t.created_at || 0
      });
    }
    out.sort((a, b) => b.created_at - a.created_at);
    return out;
  }

  // Revoke ONE device by its public device_id, scoped to the channel (an agent
  // can only revoke its own devices). Drops the device token AND any sessions it
  // would auto-resume. Returns true if a device was revoked (ea-claude-057).
  revokeDeviceById(channel_id: string, device_id: string): boolean {
    let revoked = false;
    for (const [k, t] of Object.entries(this.state.device_tokens)) {
      if (t.channel_id === channel_id && t.device_id === device_id) {
        delete this.state.device_tokens[k];
        revoked = true;
      }
    }
    // Note: existing live sessions on other tabs of that device keep their 12h
    // session cookie until expiry; the device can no longer auto-resume. For a
    // hard cut, the owner uses revoke-all. (Documented in wire-protocol.md.)
    if (revoked) this.scheduleFlush();
    return revoked;
  }

  // --- channels ---
  recordChannel(meta: ChannelMeta): void {
    const existing = this.state.channels[meta.channel_id];
    this.state.channels[meta.channel_id] = {
      ...meta,
      // first_seen_at is set once (don't reset on reconnect) so the idle clock
      // is stable for an agent that connects but is never read.
      first_seen_at: existing?.first_seen_at ?? meta.first_seen_at,
      // preserve human-activity timestamp across reconnects.
      last_active_at: existing?.last_active_at
    };
    this.scheduleFlush();
  }

  channelKey(channel_id: string): string | null {
    return this.state.channels[channel_id]?.agent_key ?? null;
  }

  getChannel(channel_id: string): ChannelMeta | null {
    return this.state.channels[channel_id] ?? null;
  }

  // Record human activity (pair / authenticated /api/* request) on a channel.
  touchChannelActivity(channel_id: string, now: number = Date.now()): void {
    const c = this.state.channels[channel_id];
    if (!c) return;
    c.last_active_at = now;
    this.scheduleFlush();
  }

  // For tests / inspection.
  snapshot(): State {
    return structuredClone(this.state);
  }
}
