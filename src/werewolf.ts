// Village Werewolf — live demo surface (event sub-page).
//
// The host is a thin display + relay: the actual game runs on an operator's
// machine (NPC brains + Edge Book orchestration) and PUSHes a state snapshot
// here over POST /werewolf/events (Bearer ADMIN_TOKEN, fail-closed when unset).
// The public projector page (GET /werewolf) polls GET /werewolf/events.
//
// Joining is plain Edge Book: attendees friend the game's Narrator agent (a
// dial-out on this host), so no game state lives in the host store.
import type http from "node:http";
import { timingSafeEqual as tse } from "node:crypto";
import { renderWerewolfHtml } from "./werewolf-html.js";

export interface WerewolfSnapshot {
  events: unknown[];          // game event log (projector feed)
  lobby: Array<{ name: string; kind: "human" | "npc" | "open"; alive: boolean; role?: string }>;
  phase: string;              // LOBBY | NIGHT n | DAY n | VOTE n | END
  status: string;             // waiting | running | over
  round: number;
  updatedAt: number;
}

const EMPTY: WerewolfSnapshot = { events: [], lobby: [], phase: "LOBBY", status: "waiting", round: 0, updatedAt: 0 };
let snapshot: WerewolfSnapshot = { ...EMPTY };

function bearer(req: http.IncomingMessage): string {
  const h = req.headers.authorization;
  if (typeof h !== "string") return "";
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  return m?.[1] ?? "";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && tse(ab, bb);
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// Validate an inbound snapshot push; returns a sanitized snapshot or null.
function coerce(body: unknown): WerewolfSnapshot | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.events)) return null;
  // Shape-validate each lobby entry: a malformed push (e.g. [null, 123]) must
  // not reach the projector, where renderRoster would throw on p.name/p.alive.
  const rawLobby = Array.isArray(b.lobby) ? b.lobby : [];
  const lobby = rawLobby
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string")
    .slice(0, 64)
    .map((p) => ({
      name: String(p.name).slice(0, 60),
      kind: p.kind === "human" || p.kind === "open" ? p.kind : "npc",
      alive: p.alive !== false,
      ...(typeof p.role === "string" ? { role: p.role.slice(0, 24) } : {}),
    })) as WerewolfSnapshot["lobby"];
  return {
    events: b.events.slice(0, 5000),
    lobby,
    phase: typeof b.phase === "string" ? b.phase.slice(0, 32) : "LOBBY",
    status: typeof b.status === "string" ? b.status.slice(0, 16) : "waiting",
    round: typeof b.round === "number" ? b.round : 0,
    updatedAt: Date.now(),
  };
}

export function isWerewolfRequest(url: URL): boolean {
  return url.pathname === "/werewolf" || url.pathname.startsWith("/werewolf/");
}

async function readBody(req: http.IncomingMessage, limit = 512 * 1024): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw new Error("too_large"); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString("utf8");
}

// Returns true if the request carries the configured admin token. Writes the
// rejection response (404 fail-closed when unset, 401 on mismatch) and returns
// false otherwise.
function adminOk(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const configured = process.env.ADMIN_TOKEN || "";
  if (!configured) { json(res, 404, { ok: false, error: "not_found" }); return false; }
  if (!safeEqual(bearer(req), configured)) { json(res, 401, { ok: false, error: "unauthorized" }); return false; }
  return true;
}

function handlePush(req: http.IncomingMessage, res: http.ServerResponse, rawBody: string): void {
  if (!adminOk(req, res)) return;
  let parsed: unknown;
  try { parsed = rawBody.length ? JSON.parse(rawBody) : {}; }
  catch { json(res, 400, { ok: false, error: "invalid_json" }); return; }
  const next = coerce(parsed);
  if (!next) { json(res, 400, { ok: false, error: "invalid_snapshot" }); return; }
  snapshot = next;
  json(res, 200, { ok: true, updatedAt: snapshot.updatedAt });
}

// Handle any /werewolf* request. Reads its own POST body unless `injectedBody`
// is provided (tests). Security headers are set by the caller. Always handles.
export async function handleWerewolf(req: http.IncomingMessage, res: http.ServerResponse, url: URL, injectedBody?: string): Promise<void> {
  const method = req.method || "GET";
  const p = url.pathname;

  if (p === "/werewolf" && method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderWerewolfHtml(process.env.WEREWOLF_NARRATOR_HANDLE || "eddingham"));
    return;
  }
  if (p === "/werewolf/events" && method === "GET") { json(res, 200, snapshot); return; }
  if (p === "/werewolf/events" && method === "POST") {
    const body = injectedBody ?? await readBody(req).catch(() => null);
    if (body === null) { json(res, 413, { ok: false, error: "body_too_large" }); return; }
    handlePush(req, res, body);
    return;
  }
  if (p === "/werewolf/reset" && method === "POST") {
    if (!adminOk(req, res)) return;
    snapshot = { ...EMPTY, updatedAt: Date.now() };
    json(res, 200, { ok: true });
    return;
  }
  json(res, 404, { ok: false, error: "not_found" });
}

// Test-only reset of module state.
export function __resetForTest(): void { snapshot = { ...EMPTY }; }
