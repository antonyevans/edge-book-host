// Edge Book host — single HTTP+WebSocket server (the repo's only entry point;
// `npm start` runs the compiled dist/server.js, fly.toml serves it).
//
// Trust boundaries (every route falls in exactly one):
//   PUBLIC (no auth): GET / (landing|reader shell), /pair (rate-limited form),
//     /agent-setup, /add, /handle/:handle (registry resolve), /health, /healthz, /metrics.
//   SESSION + CSRF: /auth/* and every /api/* proxy call — session cookie
//     (ebh_session, 12h) minted at pair time; device cookie (ebh_device, 28d)
//     auto-resumes; mutating /api/* requires the x-csrf-token double-submit.
//   CHANNEL (agent socket): wss /agent/ws — TOFU agent_key, see channels.ts
//     and docs/wire-protocol.md.
//
// Invariant: the host never forwards browser cookies/authorization headers to
// the agent — the channel itself is the authorization (wire-protocol.md §API
// proxy). Sessions/devices are bound to a channel_id and dropped on
// sessions_revoke.
import http from "node:http";
import { URL } from "node:url";
import cookie from "cookie";
import { WebSocketServer } from "ws";
import { HostStore } from "./store.js";
import { ChannelRegistry } from "./channels.js";
import { normalizePairingCode, randomToken } from "./tokens.js";
import { RateLimiter } from "./rate-limit.js";
import { renderReaderHtml } from "./reader-html.js";
import { renderAddHtml, renderAgentSetupHtml, renderOfflineHtml } from "./reader-landing.js";
import { renderPairHtml } from "./reader-pair.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || "./data";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEVICE_TTL_MS = 28 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE = process.env.COOKIE_INSECURE !== "1";

const SESSION_COOKIE = "ebh_session";
const DEVICE_COOKIE = "ebh_device";

// Hide the cookies + auth-bearing headers from the agent — the channel itself
// is the authorization. See docs/wire-protocol.md.
const FORWARD_HEADER_DENYLIST = new Set([
  "host", "cookie", "set-cookie", "authorization",
  "x-csrf-token", "x-openclaw-session", "x-openclaw-csrf",
  "content-length", "connection", "transfer-encoding", "upgrade"
]);

const store = new HostStore(DATA_DIR);
const channels = new ChannelRegistry(store);
const pairLimiter = new RateLimiter(10, 60_000, 5 * 60_000);

// Idle stand-down: a dial-out with no human activity (pair / authed /api/*) for
// this long is told to disconnect and stop reconnecting (ea-claude-061).
// Default 7 days; override with EDGE_BOOK_IDLE_MS. Session TTL 12h < idle 7d < device 28d.
const IDLE_TIMEOUT_MS = Number(process.env.EDGE_BOOK_IDLE_MS) || 7 * 24 * 60 * 60 * 1000;
const IDLE_SWEEP_MS = Number(process.env.EDGE_BOOK_IDLE_SWEEP_MS) || 60 * 60 * 1000; // hourly

setInterval(() => store.purge(), 60_000).unref();
setInterval(() => { try { channels.sweepIdle(IDLE_TIMEOUT_MS); } catch { /* ignore */ } }, IDLE_SWEEP_MS).unref();

function setCookie(res: http.ServerResponse, name: string, value: string, ttl_ms: number): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ttl_ms / 1000)}`
  ];
  if (COOKIE_SECURE) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function clearCookie(res: http.ServerResponse, name: string): void {
  const parts = [`${name}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (COOKIE_SECURE) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function appendSetCookie(res: http.ServerResponse, value: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, value]);
  else if (typeof existing === "string") res.setHeader("Set-Cookie", [existing, value]);
  else res.setHeader("Set-Cookie", value);
}

function readCookies(req: http.IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw) return {};
  return cookie.parse(raw) as Record<string, string>;
}

// Coarse, non-identifying device label from the User-Agent for the device list
// (ea-claude-057). Best-effort: "Chrome on macOS", "Safari on iPhone", etc.
function deviceLabel(ua: string | undefined): string {
  if (!ua) return "device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  const osName = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Macintosh|Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${osName}`;
}

function clientIp(req: http.IncomingMessage): string {
  const fwd = req.headers["fly-client-ip"] || req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress || "unknown";
}

function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (COOKIE_SECURE) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  setSecurityHeaders(res);
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  setSecurityHeaders(res);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function redirect(res: http.ServerResponse, location: string): void {
  setSecurityHeaders(res);
  res.writeHead(303, { location });
  res.end();
}

// Defense-in-depth: an agent must never ship its signing key, but if a buggy
// /api/* handler does, the host strips it before relaying to the browser.
// Primary fix lives in the agent's /api/me handler (ea-claude-050).
const SECRET_KEY_RE = /private[_-]?key|secret|seed|mnemonic|passphrase/i;
const PEM_PRIVATE_SRC = "-----BEGIN[^-]*PRIVATE KEY-----[\\s\\S]*?-----END[^-]*PRIVATE KEY-----";

function deepRedactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepRedactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) continue;
      out[k] = deepRedactSecrets(v);
    }
    return out;
  }
  if (typeof value === "string" && new RegExp(PEM_PRIVATE_SRC).test(value)) {
    return "[redacted-by-host]";
  }
  return value;
}

function redactSecretsFromBody(buf: Buffer, contentType: string | undefined): Buffer {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const cleaned = deepRedactSecrets(JSON.parse(buf.toString("utf8")));
      return Buffer.from(JSON.stringify(cleaned), "utf8");
    } catch {
      /* not parseable JSON — fall through to raw PEM scrub */
    }
  }
  const text = buf.toString("utf8");
  const scrubbed = text.replace(new RegExp(PEM_PRIVATE_SRC, "g"), "[redacted-by-host]");
  return scrubbed === text ? buf : Buffer.from(scrubbed, "utf8");
}

async function readBody(req: http.IncomingMessage, limit = 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw new Error("body_too_large");
  chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function parseForm(body: Buffer): Record<string, string> {
  const params = new URLSearchParams(body.toString("utf8"));
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

interface AuthedSession {
  session_id: string;
  channel_id: string;
  csrf_token: string;
}

function resolveSession(req: http.IncomingMessage, res: http.ServerResponse): AuthedSession | null {
  const cookies = readCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    const sess = store.getSession(sid);
    if (sess) return { session_id: sess.session_id, channel_id: sess.channel_id, csrf_token: sess.csrf_token };
  }
  // Try device-token auto-resume.
  const device = cookies[DEVICE_COOKIE];
  if (device) {
    const token = store.getDeviceToken(device);
    if (token) {
      store.touchDevice(device); // last-seen for the device list (ea-claude-057)
      const session_id = randomToken();
      const csrf_token = randomToken();
      const expires_at = Date.now() + SESSION_TTL_MS;
      store.createSession({ session_id, channel_id: token.channel_id, csrf_token, expires_at });
      setCookie(res, SESSION_COOKIE, session_id, SESSION_TTL_MS);
      return { session_id, channel_id: token.channel_id, csrf_token };
    }
  }
  return null;
}

function requireCsrf(req: http.IncomingMessage, session: AuthedSession, formValue?: string): boolean {
  const header = req.headers["x-csrf-token"];
  const candidate = typeof header === "string" ? header : formValue || "";
  if (!candidate) return false;
  return candidate === session.csrf_token;
}

// Guarantee a valid pair CSRF token that matches the ebh_pair_csrf cookie, so
// the rendered form's double-submit token is always usable. Reuse the existing
// cookie if present, else mint one and set the cookie. Every /pair render (GET
// and all error re-renders) MUST use this — rendering an empty/unbacked token
// leaves the form unsubmittable until a manual reload (ea-claude-054).
function ensurePairCsrf(req: http.IncomingMessage, res: http.ServerResponse): string {
  const cookies = readCookies(req);
  let csrf = cookies["ebh_pair_csrf"];
  if (!csrf) {
    csrf = randomToken(16);
    appendSetCookie(res, `ebh_pair_csrf=${csrf}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${COOKIE_SECURE ? "; Secure" : ""}`);
  }
  return csrf;
}

async function handlePair(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  if (req.method === "GET") {
    sendHtml(res, 200, renderPairHtml({ csrf_token: ensurePairCsrf(req, res), error: url.searchParams.get("error") || undefined }));
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const ip = clientIp(req);
  // Read-only gate: only a prior run of FAILED attempts locks an IP out, so
  // many people pairing successfully behind one shared egress IP (venue wifi)
  // never trip this. (ea-claude-058)
  const gate = pairLimiter.peek(ip);
  if (!gate.allowed) {
    // Keep a usable token so the user can submit immediately once the lockout
    // clears — no manual reload needed (ea-claude-054).
    sendHtml(res, 429, renderPairHtml({ csrf_token: ensurePairCsrf(req, res), error: `Too many attempts. Try again in ${Math.ceil(gate.retry_after_ms / 1000)}s.` }));
    return;
  }
  let body: Buffer;
  try { body = await readBody(req, 4096); } catch { sendJson(res, 413, { ok: false, error: "body_too_large" }); return; }
  const form = parseForm(body);
  const cookies = readCookies(req);
  if (!form.csrf || !cookies["ebh_pair_csrf"] || form.csrf !== cookies["ebh_pair_csrf"]) {
    // A stale/missing CSRF token is a benign fumble, not a guess — don't count it.
    // Re-issue a matching token so the next submit works without a manual reload.
    sendHtml(res, 403, renderPairHtml({ csrf_token: ensurePairCsrf(req, res), error: "Your form expired. Please try again." }));
    return;
  }
  const code = normalizePairingCode(form.code || "");
  const channel_id = store.consumePairingCode(code);
  if (!channel_id) {
    // A wrong/expired code IS a guess — count it toward the lockout.
    pairLimiter.recordFailure(ip);
    sendHtml(res, 400, renderPairHtml({ csrf_token: ensurePairCsrf(req, res), error: "Invalid or expired code. Run `edge-book pair` on your agent for a fresh one." }));
    return;
  }
  // Successful pair — clear this IP's failure budget so it never accumulates.
  pairLimiter.reset(ip);
  // spec-135: signal the paired agent that a human browser just connected.
  // Drops silently when the agent has no live socket at redemption time.
  channels.pushFrame(channel_id, {
    type: "pair_complete",
    device_id: channel_id,
    label: deviceLabel(req.headers["user-agent"]),
  });
  // Human activity — resets the idle-timeout clock for this channel (ea-061).
  store.touchChannelActivity(channel_id);
  // Bind a session.
  const session_id = randomToken();
  const csrf_token = randomToken();
  store.createSession({ session_id, channel_id, csrf_token, expires_at: Date.now() + SESSION_TTL_MS });
  setCookie(res, SESSION_COOKIE, session_id, SESSION_TTL_MS);
  if (form.remember === "1") {
    const device_token = randomToken();
    const now = Date.now();
    store.createDeviceToken({
      device_token,
      channel_id,
      expires_at: now + DEVICE_TTL_MS,
      device_id: randomToken(8),                 // non-secret public handle (ea-claude-057)
      label: deviceLabel(req.headers["user-agent"]),
      created_at: now,
      last_seen_at: now
    });
    setCookie(res, DEVICE_COOKIE, device_token, DEVICE_TTL_MS);
  }
  // Clear the pair CSRF cookie.
  appendSetCookie(res, `ebh_pair_csrf=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`);
  redirect(res, "/");
}

async function handleLogout(req: http.IncomingMessage, res: http.ServerResponse, session: AuthedSession): Promise<void> {
  const body = await readBody(req, 4096).catch(() => Buffer.alloc(0));
  const form = parseForm(body);
  if (!requireCsrf(req, session, form.csrf)) {
    sendJson(res, 403, { ok: false, error: "csrf_failed" });
    return;
  }
  store.revokeSession(session.session_id);
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, DEVICE_COOKIE);
  redirect(res, "/pair");
}

async function handleApiProxy(req: http.IncomingMessage, res: http.ServerResponse, url: URL, session: AuthedSession): Promise<void> {
  // Authenticated request — human activity, resets the idle clock (ea-061).
  store.touchChannelActivity(session.channel_id);
  // CSRF required on mutations.
  if (req.method && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    if (!requireCsrf(req, session)) {
      sendJson(res, 403, { ok: false, error: "csrf_failed" });
      return;
    }
  }
  if (!channels.has(session.channel_id)) {
    sendJson(res, 502, { ok: false, error: "agent_offline" });
    return;
  }
  let body: Buffer;
  try { body = await readBody(req); } catch { sendJson(res, 413, { ok: false, error: "body_too_large" }); return; }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v !== "string") continue;
    if (FORWARD_HEADER_DENYLIST.has(k.toLowerCase())) continue;
    headers[k] = v;
  }
  const request_id = randomToken(12);
  try {
    const response = await channels.proxy(session.channel_id, request_id, {
      method: req.method || "GET",
      path: url.pathname,
      query: url.search,
      headers,
      body_b64: body.length ? body.toString("base64") : null
    });
    setSecurityHeaders(res);
    const responseHeaders: Record<string, string> = {};
    let contentType: string | undefined;
    for (const [k, v] of Object.entries(response.headers || {})) {
      const lk = k.toLowerCase();
      if (FORWARD_HEADER_DENYLIST.has(lk)) continue;
      if (lk === "content-length") continue; // recomputed after redaction
      if (typeof v !== "string") continue;
      if (lk === "content-type") contentType = v;
      responseHeaders[k] = v;
    }
    const outBody = redactSecretsFromBody(Buffer.from(response.body_b64, "base64"), contentType);
    res.writeHead(response.status, responseHeaders);
    res.end(outBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "agent_offline" || msg.startsWith("channel_closed")) {
      sendJson(res, 502, { ok: false, error: "agent_offline" });
      return;
    }
    if (msg === "request_timeout") {
      sendJson(res, 504, { ok: false, error: "request_timeout" });
      return;
    }
    sendJson(res, 500, { ok: false, error: msg });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/healthz") {
      const m = channels.metrics();
      sendJson(res, 200, { ok: true, connected_channels: m.connected_channels, mailbox_queue_depth: m.mailbox_queue_depth });
      return;
    }
    // Minimal unauthenticated liveness probe. /healthz (above) backs the fly.toml
    // http_check and carries channel metrics; /health is the conventional path for
    // external monitors and returns the smallest possible body.
    if (url.pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }
    if (url.pathname === "/metrics") {
      const m = channels.metrics();
      sendJson(res, 200, {
        ok: true,
        connected_channels: m.connected_channels,
        mailbox_queue_depth: m.mailbox_queue_depth,
        receipts_ledger_size: m.receipts_ledger_size,
        deliveries: m.deliveries,
        uptime_s: Math.round(process.uptime()),
      });
      return;
    }
    if (url.pathname === "/agent-setup" && req.method === "GET") {
      sendHtml(res, 200, renderAgentSetupHtml());
      return;
    }
    // Public agent-to-agent invite landing. The card travels in the URL fragment
    // (decoded client-side), so this page needs no session and the host sees no
    // payload. Reached by scanning the "Add me" QR / opening the shared link.
    if (url.pathname === "/add" && req.method === "GET") {
      sendHtml(res, 200, renderAddHtml());
      return;
    }
    // Cheap cookie-only session probe for the /add page (ea-claude-095). Reports
    // whether THIS browser is already bound to an agent so /add can offer a
    // one-tap handoff. No agent round-trip — works even if the agent is offline.
    if (url.pathname === "/auth/session" && req.method === "GET") {
      const probe = resolveSession(req, res);
      sendJson(res, 200, { authenticated: !!probe });
      return;
    }
    // Public handle resolution (spec-096): returns the stored signed agent card
    // for a claimed handle, or 404. No session — handles are meant to be public.
    if (req.method === "GET" && url.pathname.startsWith("/handle/")) {
      const handle = decodeURIComponent(url.pathname.slice("/handle/".length));
      const rec = store.resolveHandle(handle);
      if (!rec) { sendJson(res, 404, { ok: false, error: "not_found" }); return; }
      sendJson(res, 200, rec.card);
      return;
    }
    if (url.pathname === "/pair") {
      await handlePair(req, res, url);
      return;
    }
    const session = resolveSession(req, res);
    if (!session) {
      if (url.pathname.startsWith("/api/")) { sendJson(res, 401, { ok: false, error: "unauthorized" }); return; }
      if (url.pathname === "/" || url.pathname === "/app") { redirect(res, "/pair"); return; }
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    if (url.pathname === "/auth/logout" && req.method === "POST") {
      await handleLogout(req, res, session);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/app") {
      const online = channels.has(session.channel_id);
      if (!online) { sendHtml(res, 200, renderOfflineHtml()); return; }
      sendHtml(res, 200, renderReaderHtml({ csrf_token: session.csrf_token, agent_online: true }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApiProxy(req, res, url, session);
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { sendJson(res, 500, { ok: false, error: msg }); } catch { /* socket closed */ }
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/agent/ws") {
    socket.destroy();
    return;
  }
  const remote = clientIp(req);
  wss.handleUpgrade(req, socket, head, (ws) => attachAgentSocket(ws, remote));
});

function attachAgentSocket(ws: import("ws").WebSocket, remote: string): void {
  let channel_id: string | null = null;
  const helloTimer = setTimeout(() => {
    console.log(`[edge-book-host] agent_hello_timeout remote=${remote}`);
    try { ws.close(1002, "hello_timeout"); } catch { /* ignore */ }
  }, 10_000);

  ws.on("message", (raw) => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.concat(raw as Buffer[]).toString("utf8"));
    } catch {
      try { ws.send(JSON.stringify({ type: "error", error: "invalid_json" })); } catch { /* ignore */ }
      return;
    }
    if (!channel_id) {
      if (frame.type !== "hello") {
        try { ws.send(JSON.stringify({ type: "hello_err", error: "hello_required" })); } catch { /* ignore */ }
        try { ws.close(1002, "hello_required"); } catch { /* ignore */ }
        return;
      }
      const agent_key = typeof frame.agent_key === "string" ? frame.agent_key : "";
      const agent_did = typeof frame.agent_did === "string" ? frame.agent_did : null;
      if (!agent_key) {
        try { ws.send(JSON.stringify({ type: "hello_err", error: "missing_agent_key" })); ws.close(1002, "missing_agent_key"); } catch { /* ignore */ }
        return;
      }
      const result = channels.attach(ws, agent_key, agent_did, remote);
      if (!result.ok) {
        try { ws.send(JSON.stringify({ type: "hello_err", error: result.error })); ws.close(1008, result.error); } catch { /* ignore */ }
        return;
      }
      channel_id = result.channel_id;
      clearTimeout(helloTimer);
      try { ws.send(JSON.stringify({ type: "hello_ok", channel_id, server_time: new Date().toISOString() })); } catch { /* ignore */ }
      // Flush any store-and-forward envelopes queued while this channel was
      // offline (ea-claude-064). Deferred a tick after hello_ok so a client that
      // wires its frame handler right after the handshake doesn't miss the first
      // delivery. Delivery is at-least-once regardless — unacked messages stay
      // queued and redeliver on the next connect.
      const cid = channel_id;
      setImmediate(() => { try { channels.flushMailbox(cid); } catch { /* ignore */ } });
      return;
    }
    channels.handleFrame(channel_id, ws, frame);
  });

  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (channel_id) channels.detachConnection(channel_id, ws, "socket_closed");
  });
  ws.on("error", () => { /* covered by close */ });
}

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, HOST, () => {
    console.log(`[edge-book-host] listening on ${HOST}:${PORT} (data=${DATA_DIR}, secure_cookies=${COOKIE_SECURE})`);
  });
}

export { server, store, channels };
