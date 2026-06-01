import type { WebSocket } from "ws";
import { channelIdFromKey, timingSafeEqual } from "./tokens.js";
import type { HostStore } from "./store.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const MAX_MISSED_PONGS = 2;

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
}

interface Channel {
  channel_id: string;
  agent_key: string;
  agent_did: string | null;
  ws: WebSocket;
  pending: Map<string, PendingRequest>;
  missedPongs: number;
}

export class ChannelRegistry {
  private channels = new Map<string, Channel>();

  constructor(private store: HostStore) {}

  has(channel_id: string): boolean {
    return this.channels.has(channel_id);
  }

  get(channel_id: string): Channel | undefined {
    return this.channels.get(channel_id);
  }

  // Register a fresh dial-out. Enforces TOFU: a channel's agent_key is fixed
  // for the lifetime of host state — reconnects with a different key are rejected.
  attach(ws: WebSocket, agent_key: string, agent_did: string | null): { ok: true; channel_id: string } | { ok: false; error: string } {
    const channel_id = channelIdFromKey(agent_key);
    const recorded = this.store.channelKey(channel_id);
    if (recorded && !timingSafeEqual(recorded, agent_key)) {
      return { ok: false, error: "agent_key_mismatch" };
    }
    if (this.channels.has(channel_id)) {
      // Replace stale connection (e.g. previous socket not yet closed by the kernel).
      const old = this.channels.get(channel_id)!;
      try { old.ws.close(1001, "replaced"); } catch { /* ignore */ }
      for (const pending of old.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("channel_replaced"));
      }
    }
    const now = Date.now();
    this.store.recordChannel({
      channel_id,
      agent_key,
      agent_did,
      first_seen_at: recorded ? now : now,
      last_seen_at: now
    });
    const channel: Channel = {
      channel_id,
      agent_key,
      agent_did,
      ws,
      pending: new Map(),
      missedPongs: 0
    };
    this.channels.set(channel_id, channel);
    this.startHeartbeat(channel);
    return { ok: true, channel_id };
  }

  detach(channel_id: string, reason: string): void {
    const channel = this.channels.get(channel_id);
    if (!channel) return;
    for (const pending of channel.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`channel_closed:${reason}`));
    }
    this.channels.delete(channel_id);
  }

  // Frame an API request onto the channel; await the response correlated by request_id.
  async proxy(channel_id: string, request_id: string, req: ApiRequest): Promise<ApiResponse> {
    const channel = this.channels.get(channel_id);
    if (!channel) throw new Error("agent_offline");
    return new Promise<ApiResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.pending.delete(request_id);
        reject(new Error("request_timeout"));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      channel.pending.set(request_id, { resolve, reject, timer });
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
        channel.ws.send(frame);
      } catch (err) {
        clearTimeout(timer);
        channel.pending.delete(request_id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // Called by the server when a frame arrives on a channel's socket.
  handleFrame(channel_id: string, data: unknown): void {
    const channel = this.channels.get(channel_id);
    if (!channel) return;
    if (typeof data !== "object" || data === null) return;
    const frame = data as Record<string, unknown>;
    const type = frame.type;
    if (type === "pong") {
      channel.missedPongs = 0;
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
        this.send(channel, { type: "pair_register_err", request_id, error: "invalid_pair_request" });
        return;
      }
      this.store.registerPairingCode(code, channel.channel_id, ttl_ms);
      this.send(channel, { type: "pair_register_ok", request_id });
      return;
    }
    if (type === "sessions_revoke") {
      const request_id = String(frame.request_id || "");
      const count = this.store.revokeChannelSessions(channel.channel_id);
      this.send(channel, { type: "sessions_revoke_ok", request_id, revoked: count });
      return;
    }
    // Unknown — log and continue.
    this.send(channel, { type: "error", error: "unknown_message_type", ref: typeof type === "string" ? type : null });
  }

  private startHeartbeat(channel: Channel): void {
    const interval: NodeJS.Timeout = setInterval(() => {
      if (channel.ws.readyState !== channel.ws.OPEN) {
        clearInterval(interval);
        return;
      }
      channel.missedPongs++;
      if (channel.missedPongs > MAX_MISSED_PONGS) {
        clearInterval(interval);
        try { channel.ws.close(1011, "heartbeat_timeout"); } catch { /* ignore */ }
        return;
      }
      this.send(channel, { type: "ping" });
    }, PING_INTERVAL_MS);
    interval.unref();
    channel.ws.on("close", () => clearInterval(interval));
  }

  private send(channel: Channel, payload: Record<string, unknown>): void {
    try {
      channel.ws.send(JSON.stringify(payload));
    } catch { /* ignore */ }
  }
}
