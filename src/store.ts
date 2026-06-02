import fs from "node:fs";
import path from "node:path";

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
  device_token: string;
  channel_id: string;
  expires_at: number;
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

interface State {
  pairing_codes: Record<string, PairingCode>;
  sessions: Record<string, Session>;
  device_tokens: Record<string, DeviceToken>;
  channels: Record<string, ChannelMeta>;
}

const EMPTY: State = {
  pairing_codes: {},
  sessions: {},
  device_tokens: {},
  channels: {}
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
        channels: parsed.channels || {}
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
    this.scheduleFlush();
  }

  // --- pairing codes ---
  registerPairingCode(code: string, channel_id: string, ttl_ms: number): void {
    this.state.pairing_codes[code] = {
      code,
      channel_id,
      expires_at: Date.now() + ttl_ms
    };
    this.scheduleFlush();
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
