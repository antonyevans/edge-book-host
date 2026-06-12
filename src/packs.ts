// Starter packs (spec-145): operator-curated bundles of member handles that a
// newcomer can friend in one command. A pack is curation, not trust — the host
// stores handle slugs only; every join resolves each handle live and sends a
// NORMAL friend request from the CLI side.
//
// Routes owned here:
//   PUBLIC:        GET /packs — { slug, title, description, member_count }[];
//                  member handles NEVER appear here (an unauthenticated member
//                  list would be a graph-enumeration primitive).
//   AGENT:         GET /pack/:slug — full record incl. members. Auth seam: the
//                  channel itself is the authorization (same trust posture as
//                  /agent/ws) — the caller presents its dial-out agent_key as
//                  a Bearer token and must map to a known channel
//                  (channel_id = sha256(agent_key)). 401 missing/malformed,
//                  403 unknown agent. Rate limit: 1 fetch per agent per pack
//                  per window (default 10 min) → 429; this fetch gates the
//                  join fan-out, so it bounds the cross-joiner request flood.
//   ADMIN:         PUT/DELETE /admin/pack/:slug — called from admin.ts AFTER
//                  its Bearer ADMIN_TOKEN gate (fail-closed 404 when unset).
//
// DEFAULT_PACK_SLUG env: GET /pack/default returns the named pack's body
// directly (200, no redirect — CLI clients have no browser redirect
// semantics); 404 when unset. `default` is on the reserved-slug list so it
// can never name a real pack (or be claimed as a handle).
import type http from "node:http";
import { isValidSlug } from "./handles.js";
import type { HostStore } from "./store.js";
import { channelIdFromKey } from "./tokens.js";

export const PACK_MEMBER_CAP = 50;
export const PACK_CAP = 100;

export interface PackRecord {
  slug: string;
  title: string;
  description: string;
  member_handles: string[];
  updated_at: number;
}

type SendJson = (res: http.ServerResponse, status: number, body: unknown) => void;

// Per-agent per-pack fixed window. Env-tunable for tests; read per call so the
// long-lived server instance honors per-test overrides.
function fetchWindowMs(): number {
  const raw = Number(process.env.EDGE_BOOK_PACK_FETCH_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10 * 60 * 1000;
}

const fetchWindows = new Map<string, number>(); // `${channel_id}:${slug}` -> window start (epoch ms)

function consumeFetchBudget(channel_id: string, slug: string, now = Date.now()): { allowed: boolean; retry_after_ms: number } {
  const key = `${channel_id}:${slug}`;
  const started = fetchWindows.get(key);
  const window = fetchWindowMs();
  if (started !== undefined && now - started < window) {
    return { allowed: false, retry_after_ms: window - (now - started) };
  }
  fetchWindows.set(key, now);
  return { allowed: true, retry_after_ms: 0 };
}

function bearerToken(req: http.IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  return m?.[1] ?? null;
}

// GET /packs — public listing, no member handles, sorted by slug.
export function handlePacksList(res: http.ServerResponse, store: HostStore, sendJson: SendJson): void {
  const packs = Object.values(store.packsMap())
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((p) => ({ slug: p.slug, title: p.title, description: p.description, member_count: p.member_handles.length }));
  sendJson(res, 200, packs);
}

// GET /pack/:slug — authenticated member-list fetch (the join gate).
export function handlePackFetch(req: http.IncomingMessage, res: http.ServerResponse, url: URL, store: HostStore, sendJson: SendJson): void {
  const presented = bearerToken(req);
  if (!presented) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  // Known channel = has dialed out at least once (TOFU record in the store).
  // The lookup is by sha256(agent_key), mirroring the /agent/ws hello.
  const channel_id = channelIdFromKey(presented);
  if (!store.getChannel(channel_id)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }
  let slug = decodeURIComponent(url.pathname.slice("/pack/".length));
  if (slug === "default") {
    const named = process.env.DEFAULT_PACK_SLUG || "";
    if (!named) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    slug = named; // 200 with the named pack's body — never a redirect.
  }
  const pack = store.packsMap()[slug];
  if (!pack) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }
  const budget = consumeFetchBudget(channel_id, slug);
  if (!budget.allowed) {
    sendJson(res, 429, { ok: false, error: "rate_limited", retry_after_ms: budget.retry_after_ms });
    return;
  }
  sendJson(res, 200, pack);
}

function validatePackBody(body: unknown): { ok: true; title: string; description: string; member_handles: string[] } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return { ok: false, error: "invalid_title" };
  const description = typeof b.description === "string" ? b.description : "";
  if (!Array.isArray(b.member_handles)) return { ok: false, error: "invalid_member_handles" };
  for (const m of b.member_handles) {
    if (typeof m !== "string" || !isValidSlug(m)) return { ok: false, error: `invalid_member_handle: ${String(m)}` };
  }
  if (b.member_handles.length > PACK_MEMBER_CAP) return { ok: false, error: `too_many_members (max ${PACK_MEMBER_CAP})` };
  return { ok: true, title: b.title, description, member_handles: b.member_handles as string[] };
}

// PUT/DELETE /admin/pack/:slug — caller (admin.ts) has already passed the
// Bearer ADMIN_TOKEN gate; this handles method routing + validation only.
export function handleAdminPack(req: http.IncomingMessage, res: http.ServerResponse, url: URL, store: HostStore, sendJson: SendJson, body: unknown): void {
  const slug = decodeURIComponent(url.pathname.slice("/admin/pack/".length));
  if (!isValidSlug(slug)) {
    // Covers the reserved list too — `default` is reserved (spec-145).
    sendJson(res, 400, { ok: false, error: "invalid_slug" });
    return;
  }
  const packs = store.packsMap();
  if (req.method === "DELETE") {
    if (!packs[slug]) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    delete packs[slug];
    store.packsChanged();
    sendJson(res, 200, { ok: true, deleted: slug });
    return;
  }
  if (req.method !== "PUT") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const parsed = validatePackBody(body);
  if (!parsed.ok) {
    sendJson(res, 400, { ok: false, error: parsed.error });
    return;
  }
  if (!packs[slug] && Object.keys(packs).length >= PACK_CAP) {
    sendJson(res, 400, { ok: false, error: `too_many_packs (max ${PACK_CAP})` });
    return;
  }
  const pack: PackRecord = { slug, title: parsed.title, description: parsed.description, member_handles: parsed.member_handles, updated_at: Date.now() };
  packs[slug] = pack;
  store.packsChanged();
  sendJson(res, 200, { ok: true, pack });
}
