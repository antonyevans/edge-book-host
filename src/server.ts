import http from "node:http";
import { URL } from "node:url";
import cookie from "cookie";
import { WebSocketServer } from "ws";
import { HostStore } from "./store.js";
import { ChannelRegistry } from "./channels.js";
import { normalizePairingCode, randomToken } from "./tokens.js";
import { RateLimiter } from "./rate-limit.js";
import { renderOfflineHtml, renderPairHtml, renderReaderHtml } from "./reader-html.js";

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

setInterval(() => store.purge(), 60_000).unref();

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

async function handlePair(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  if (req.method === "GET") {
    // Issue a pre-auth CSRF token bound to a temporary "pair" session cookie so
    // the POST has a double-submit pair.
    const cookies = readCookies(req);
    let csrf = cookies["ebh_pair_csrf"];
    if (!csrf) {
      csrf = randomToken(16);
      appendSetCookie(res, `ebh_pair_csrf=${csrf}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${COOKIE_SECURE ? "; Secure" : ""}`);
    }
    sendHtml(res, 200, renderPairHtml({ csrf_token: csrf, error: url.searchParams.get("error") || undefined }));
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const limit = pairLimiter.check(clientIp(req));
  if (!limit.allowed) {
    sendHtml(res, 429, renderPairHtml({ csrf_token: "", error: `Too many attempts. Try again in ${Math.ceil(limit.retry_after_ms / 1000)}s.` }));
    return;
  }
  let body: Buffer;
  try { body = await readBody(req, 4096); } catch { sendJson(res, 413, { ok: false, error: "body_too_large" }); return; }
  const form = parseForm(body);
  const cookies = readCookies(req);
  if (!form.csrf || !cookies["ebh_pair_csrf"] || form.csrf !== cookies["ebh_pair_csrf"]) {
    sendHtml(res, 403, renderPairHtml({ csrf_token: "", error: "Session expired. Reload and try again." }));
    return;
  }
  const code = normalizePairingCode(form.code || "");
  const channel_id = store.consumePairingCode(code);
  if (!channel_id) {
    sendHtml(res, 400, renderPairHtml({ csrf_token: cookies["ebh_pair_csrf"] || randomToken(16), error: "Invalid or expired code. Run `edge-book pair` on your agent for a fresh one." }));
    return;
  }
  // Bind a session.
  const session_id = randomToken();
  const csrf_token = randomToken();
  store.createSession({ session_id, channel_id, csrf_token, expires_at: Date.now() + SESSION_TTL_MS });
  setCookie(res, SESSION_COOKIE, session_id, SESSION_TTL_MS);
  if (form.remember === "1") {
    const device_token = randomToken();
    store.createDeviceToken({ device_token, channel_id, expires_at: Date.now() + DEVICE_TTL_MS });
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
    for (const [k, v] of Object.entries(response.headers || {})) {
      if (FORWARD_HEADER_DENYLIST.has(k.toLowerCase())) continue;
      if (typeof v === "string") responseHeaders[k] = v;
    }
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(response.body_b64, "base64"));
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
      sendJson(res, 200, { ok: true });
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
  wss.handleUpgrade(req, socket, head, (ws) => attachAgentSocket(ws));
});

function attachAgentSocket(ws: import("ws").WebSocket): void {
  let channel_id: string | null = null;
  const helloTimer = setTimeout(() => {
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
      const result = channels.attach(ws, agent_key, agent_did);
      if (!result.ok) {
        try { ws.send(JSON.stringify({ type: "hello_err", error: result.error })); ws.close(1008, result.error); } catch { /* ignore */ }
        return;
      }
      channel_id = result.channel_id;
      clearTimeout(helloTimer);
      try { ws.send(JSON.stringify({ type: "hello_ok", channel_id, server_time: new Date().toISOString() })); } catch { /* ignore */ }
      return;
    }
    channels.handleFrame(channel_id, frame);
  });

  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (channel_id) channels.detach(channel_id, "socket_closed");
  });
  ws.on("error", () => { /* covered by close */ });
}

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, HOST, () => {
    console.log(`[edge-book-host] listening on ${HOST}:${PORT} (data=${DATA_DIR}, secure_cookies=${COOKIE_SECURE})`);
  });
}

export { server, store, channels };
