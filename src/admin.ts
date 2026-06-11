// Authenticated admin/observability endpoints (ea-claude-138).
//
// Routes (all under /admin/, all GET):
//   /admin/agents            — per-agent mailbox depth + last-seen dial-out
//   /admin/trace/<trace_id>  — relay-side hops recorded for a trace
//
// Auth model — FAIL CLOSED:
//   - The token comes from the ADMIN_TOKEN env var, read per request (so a
//     deploy can rotate it without code changes, and tests can toggle it).
//   - ADMIN_TOKEN unset/empty → every /admin/* path returns 404, exactly like
//     any unknown route. The surface does not exist unless explicitly enabled.
//   - Token present but the request's Bearer token missing/wrong → 401.
//     Comparison is constant-time (timingSafeEqual; the length pre-check
//     matches the repo's existing TOFU key comparison).
//
// Responses carry routing metadata only: channel ids, DIDs, timestamps,
// queue depths, trace hops. Never blobs, tokens, cookies, or envelope
// plaintext (the host cannot see plaintext by design).
import type http from "node:http";
import type { ChannelRegistry } from "./channels.js";
import type { TraceRing } from "./observe.js";
import type { HostStore } from "./store.js";
import { timingSafeEqual } from "./tokens.js";

export interface AdminDeps {
  store: HostStore;
  channels: ChannelRegistry;
  traceRing: TraceRing;
}

export interface AdminAgentSummary {
  channel_id: string;
  agent_did: string | null;
  connected: boolean;
  mailbox_depth: number;
  /** Last dial-out attach (epoch ms). */
  last_seen_at: number;
  first_seen_at: number;
  /** Last HUMAN activity (pair / authed /api/*), if any. */
  last_active_at?: number;
}

function bearerToken(req: http.IncomingMessage): string {
  const header = req.headers.authorization;
  if (typeof header !== "string") return "";
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  return m?.[1] ?? "";
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// Handle a request under /admin/. Returns true when the request was handled
// (it always is — the caller routes by path prefix).
export function handleAdmin(req: http.IncomingMessage, res: http.ServerResponse, url: URL, deps: AdminDeps): void {
  const configured = process.env.ADMIN_TOKEN || "";
  if (!configured) {
    // Fail closed: without a configured token the admin surface does not exist.
    json(res, 404, { ok: false, error: "not_found" });
    return;
  }
  const presented = bearerToken(req);
  if (!presented || !timingSafeEqual(presented, configured)) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (url.pathname === "/admin/agents") {
    const agents: AdminAgentSummary[] = deps.store.listChannels().map((c) => ({
      channel_id: c.channel_id,
      agent_did: c.agent_did,
      connected: deps.channels.has(c.channel_id),
      mailbox_depth: deps.store.mailboxDepthFor(c.channel_id, c.agent_did),
      last_seen_at: c.last_seen_at,
      first_seen_at: c.first_seen_at,
      ...(c.last_active_at !== undefined ? { last_active_at: c.last_active_at } : {})
    }));
    json(res, 200, { ok: true, agents });
    return;
  }
  if (url.pathname.startsWith("/admin/trace/")) {
    const trace_id = decodeURIComponent(url.pathname.slice("/admin/trace/".length));
    if (!trace_id) {
      json(res, 400, { ok: false, error: "missing_trace_id" });
      return;
    }
    json(res, 200, { ok: true, trace_id, hops: deps.traceRing.lookup(trace_id) });
    return;
  }
  json(res, 404, { ok: false, error: "not_found" });
}
