// Activation-funnel instrumentation (spec-142) — host-side, metadata-derived.
//
// Every stage is derived from metadata the host already holds (pairing events,
// handle-registry claims, {to, from, ts} on mailbox sends). Mailbox blobs stay
// opaque — no envelope inspection, no agent-side reporting. Stages are honest
// proxies, named as such.
//
// Invariants:
//   - first-write-wins, mechanically: every stage write uses the
//     `existing ?? newValue` guard (pattern: recordChannel, store.ts) — never
//     an unconditional Date.now();
//   - sends to/from excluded system DIDs (FUNNEL_EXCLUDE_DIDS env, plus
//     SUPPORT_DID and the greeter's registry DID by default — both auto-reply)
//     never stamp bilateral_at, either direction;
//   - the store is bounded: over the cap, oldest-cohort-first eviction folds
//     records into the reserved "__aggregate__" row (itself never evicted),
//     keeping report totals identical before/after the fold;
//   - all stamp hooks are best-effort: callers wrap them in try/catch so a
//     funnel failure can never fail the wrapped operation (receipts posture);
//   - the report carries counts only — no DIDs anywhere in the response, and
//     cohorts with paired < 5 are suppressed (small-cohort re-identification).
import type { HostStore } from "./store.js";
import { supportRecipientDid } from "./support.js";

export const AGGREGATE_ID = "__aggregate__";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// A cohort smaller than this returns {week, suppressed} only — count-of-1
// weeks would let an operator link a known signup to an activation outcome.
const SUPPRESS_MIN_PAIRED = 5;
// Bound on the per-record bilateral peer-tracking set. A 201st distinct peer
// is not tracked, so a bilateral closed only through it is missed — an
// accepted lower-bound trade for a bounded store.
const PEERS_SENT_CAP = 200;

// Per-agent first-seen stage timestamps (ISO 8601), keyed by DID (falls back
// to channel_id for agents that never presented a DID). `peers_sent` is
// host-internal bookkeeping for bilateral detection — never reported.
export interface FunnelRecord {
  agent_id: string;
  first_seen_at: string;
  paired_at?: string;
  handle_claimed_at?: string;
  first_send_at?: string;
  bilateral_at?: string;
  peers_sent?: string[];
}

export interface FunnelWeekCounters {
  paired: number;
  handle_claimed: number;
  first_send: number;
  bilateral: number;
  bilateral_within_7d: number;
}

// Reserved row carrying per-week counter snapshots of evicted cohorts. After
// a fold, bilateral_within_7d for those weeks is a frozen lower bound.
export interface FunnelAggregate {
  agent_id: typeof AGGREGATE_ID;
  weeks: Record<string, FunnelWeekCounters>;
}

export type FunnelEntry = FunnelRecord | FunnelAggregate;

export type FunnelCohortRow =
  | ({ week: string } & FunnelWeekCounters)
  | { week: string; suppressed: true };

export interface FunnelReport {
  cohorts: FunnelCohortRow[];
  totals: FunnelWeekCounters;
  note: string;
}

function isAggregate(e: FunnelEntry): e is FunnelAggregate {
  return e.agent_id === AGGREGATE_ID;
}

// Read per use (pattern: SUPPORT_DID / ADMIN_TOKEN) so tests can toggle and a
// deploy can retune without code changes.
function funnelCap(): number {
  const n = Number(process.env.EDGE_BOOK_FUNNEL_CAP);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ISO-8601 week of an epoch-ms timestamp, e.g. "2026-W24" (week-year aware).
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // ISO: Monday=1..Sunday=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // shift to this week's Thursday
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// System DIDs whose traffic never counts toward bilateral activation. Defaults
// to SUPPORT_DID (spec-134) and the greeter's handle-registry DID (spec-132,
// slug from EDGE_BOOK_GREETER_HANDLE, default "greeter") — both auto-reply, so
// either would mark every newcomer "activated" at minute one. Standing rule:
// any future auto-replying system agent MUST be added via FUNNEL_EXCLUDE_DIDS.
function excludedIds(store: HostStore): Set<string> {
  const out = new Set<string>();
  for (const part of (process.env.FUNNEL_EXCLUDE_DIDS || "").split(",")) {
    const t = part.trim();
    if (t) out.add(t);
  }
  const support = supportRecipientDid();
  if (support) out.add(support);
  const greeterSlug = (process.env.EDGE_BOOK_GREETER_HANDLE || "greeter").trim();
  const greeter = store.resolveHandle(greeterSlug)?.agent_did;
  if (greeter) out.add(greeter);
  return out;
}

// Map an address (channel_id or DID alias) to the funnel's canonical agent id:
// the channel's DID when known, else the channel_id, else the raw address.
function canonicalAgentId(store: HostStore, address: string): string {
  const ch = store.getChannel(address) ?? store.channelByDid(address);
  if (!ch) return address;
  // A channel that gained its DID after pairing may have an orphan funnel
  // record keyed by channel_id (paired_at landed pre-DID). Reconcile it into
  // the DID record so one agent is one record and its funnel can complete.
  // Residual, accepted: directed-pair entries OTHER records hold under the
  // pre-DID key are not rewritten — a bilateral closed only through such an
  // entry is missed.
  if (ch.agent_did) reconcileOrphanRecord(store, ch.channel_id, ch.agent_did);
  return ch.agent_did ?? ch.channel_id;
}

function reconcileOrphanRecord(store: HostStore, channelId: string, did: string): void {
  if (channelId === did) return;
  const entries = store.funnelEntries();
  const orphan = entries[channelId];
  if (!orphan || isAggregate(orphan)) return;
  const target = getRecord(store, did);
  if (!target) {
    orphan.agent_id = did;
    entries[did] = orphan;
  } else {
    // First-write-wins per stage; earliest first_seen keeps the true cohort.
    if (orphan.first_seen_at < target.first_seen_at) target.first_seen_at = orphan.first_seen_at;
    target.paired_at = target.paired_at ?? orphan.paired_at;
    target.handle_claimed_at = target.handle_claimed_at ?? orphan.handle_claimed_at;
    target.first_send_at = target.first_send_at ?? orphan.first_send_at;
    target.bilateral_at = target.bilateral_at ?? orphan.bilateral_at;
    if (orphan.peers_sent?.length) {
      target.peers_sent = [...new Set([...(target.peers_sent ?? []), ...orphan.peers_sent])].slice(0, PEERS_SENT_CAP);
    }
  }
  delete entries[channelId];
  store.funnelChanged();
}

function getRecord(store: HostStore, id: string): FunnelRecord | undefined {
  const e = store.funnelEntries()[id];
  return e && !isAggregate(e) ? e : undefined;
}

function getOrCreateRecord(store: HostStore, id: string, now: number): FunnelRecord {
  const existing = getRecord(store, id);
  if (existing) return existing;
  const rec: FunnelRecord = { agent_id: id, first_seen_at: iso(now) };
  store.funnelEntries()[id] = rec;
  enforceFunnelCap(store);
  return rec;
}

// First successful pairing for the channel's agent.
export function recordPaired(store: HostStore, channel_id: string, now: number = Date.now()): void {
  const id = canonicalAgentId(store, channel_id);
  if (id === AGGREGATE_ID) return;
  const rec = getOrCreateRecord(store, id, now);
  rec.paired_at = rec.paired_at ?? iso(now);
  store.funnelChanged();
}

// First accepted handle_claim (spec-096) for the DID.
export function recordHandleClaimed(store: HostStore, agent_did: string, now: number = Date.now()): void {
  if (!agent_did || agent_did === AGGREGATE_ID) return;
  const rec = getOrCreateRecord(store, canonicalAgentId(store, agent_did), now);
  rec.handle_claimed_at = rec.handle_claimed_at ?? iso(now);
  store.funnelChanged();
}

// A mailbox send FROM the authenticated channel TO an address. Stamps the
// sender's first_send_at; when the reverse direction already exists (and
// neither endpoint is an excluded system DID), stamps bilateral_at on BOTH.
export function recordSend(store: HostStore, from_channel_id: string, to: string, now: number = Date.now()): void {
  const from = canonicalAgentId(store, from_channel_id);
  const toId = canonicalAgentId(store, to);
  if (from === AGGREGATE_ID || toId === AGGREGATE_ID) return;
  const sender = getOrCreateRecord(store, from, now);
  sender.first_send_at = sender.first_send_at ?? iso(now);
  const excluded = excludedIds(store);
  if (from !== toId && !excluded.has(from) && !excluded.has(toId) && !excluded.has(to)) {
    trackBilateral(store, sender, from, toId, now);
  }
  store.funnelChanged();
}

// Directed-pair bookkeeping for bilateral detection: remember from→to on the
// sender, and when the reverse direction already exists, stamp BOTH (if unset).
function trackBilateral(store: HostStore, sender: FunnelRecord, from: string, toId: string, now: number): void {
  // Reverse-direction check runs BEFORE the cap guard: a bilateral that is
  // already detectable from the peer's record must stamp even when the
  // sender's directed-pair list is full — closing it needs no new list entry.
  const peer = getRecord(store, toId);
  if (peer?.peers_sent?.includes(from)) {
    const stamp = iso(now);
    sender.bilateral_at = sender.bilateral_at ?? stamp;
    peer.bilateral_at = peer.bilateral_at ?? stamp;
  }
  const peers = sender.peers_sent ?? (sender.peers_sent = []);
  if (!peers.includes(toId) && peers.length < PEERS_SENT_CAP) peers.push(toId);
}

// Boot-time backfill: every known channel with no FunnelRecord gets one
// synthesized with first_seen_at = channel.first_seen_at and no stage fields,
// so pre-existing agents land in their correct historical cohort instead of
// poisoning the first post-deploy week.
export function backfillFunnel(store: HostStore): void {
  const entries = store.funnelEntries();
  let created = 0;
  for (const c of store.listChannels()) {
    const id = c.agent_did ?? c.channel_id;
    if (id === AGGREGATE_ID || entries[id]) continue;
    entries[id] = { agent_id: id, first_seen_at: iso(c.first_seen_at) };
    created++;
  }
  if (created) {
    enforceFunnelCap(store);
    store.funnelChanged();
  }
}

function zeroCounters(): FunnelWeekCounters {
  return { paired: 0, handle_claimed: 0, first_send: 0, bilateral: 0, bilateral_within_7d: 0 };
}

function bilateralWithin7d(rec: FunnelRecord): boolean {
  if (!rec.paired_at || !rec.bilateral_at) return false;
  return Date.parse(rec.bilateral_at) - Date.parse(rec.paired_at) <= SEVEN_DAYS_MS;
}

function countInto(c: FunnelWeekCounters, rec: FunnelRecord): void {
  if (rec.paired_at) c.paired++;
  if (rec.handle_claimed_at) c.handle_claimed++;
  if (rec.first_send_at) c.first_send++;
  if (rec.bilateral_at) c.bilateral++;
  if (bilateralWithin7d(rec)) c.bilateral_within_7d++;
}

function addCounters(target: FunnelWeekCounters, src: FunnelWeekCounters): void {
  target.paired += src.paired;
  target.handle_claimed += src.handle_claimed;
  target.first_send += src.first_send;
  target.bilateral += src.bilateral;
  target.bilateral_within_7d += src.bilateral_within_7d;
}

// Cap enforcement (insert-time, pattern: enforceReceiptCap): over the cap,
// evict oldest-cohort-first (by first_seen_at) and fold each evicted record's
// stage counts into the __aggregate__ row's week snapshot. The aggregate is
// excluded from the eviction sort and never evicted itself. Exported for tests.
export function enforceFunnelCap(store: HostStore): void {
  const entries = store.funnelEntries();
  const records = Object.values(entries).filter((e): e is FunnelRecord => !isAggregate(e));
  const cap = funnelCap();
  if (records.length <= cap) return;
  records.sort((a, b) => Date.parse(a.first_seen_at) - Date.parse(b.first_seen_at));
  let agg = entries[AGGREGATE_ID];
  if (!agg || !isAggregate(agg)) {
    agg = { agent_id: AGGREGATE_ID, weeks: {} } satisfies FunnelAggregate;
    entries[AGGREGATE_ID] = agg;
  }
  for (const rec of records.slice(0, records.length - cap)) {
    const week = isoWeek(Date.parse(rec.first_seen_at));
    const counters = agg.weeks[week] ?? (agg.weeks[week] = zeroCounters());
    countInto(counters, rec);
    delete entries[rec.agent_id];
  }
  store.funnelChanged();
}

// Per-cohort (ISO week of first_seen_at) stage counts + conversion totals for
// /admin/funnel. Counts only — never DIDs. Suppressed cohorts (paired < 5)
// return {week, suppressed} but still contribute to totals.
export function buildFunnelReport(store: HostStore): FunnelReport {
  const byWeek = new Map<string, FunnelWeekCounters>();
  const weekRow = (w: string): FunnelWeekCounters => {
    let c = byWeek.get(w);
    if (!c) { c = zeroCounters(); byWeek.set(w, c); }
    return c;
  };
  for (const e of Object.values(store.funnelEntries())) {
    if (isAggregate(e)) {
      for (const [w, c] of Object.entries(e.weeks)) addCounters(weekRow(w), c);
    } else {
      countInto(weekRow(isoWeek(Date.parse(e.first_seen_at))), e);
    }
  }
  const totals = zeroCounters();
  for (const c of byWeek.values()) addCounters(totals, c);
  const cohorts: FunnelCohortRow[] = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest week first
    .map(([week, c]) => (c.paired < SUPPRESS_MIN_PAIRED ? { week, suppressed: true as const } : { week, ...c }));
  return {
    cohorts,
    totals,
    note: "metadata-derived proxies; cohorts with paired < 5 are suppressed but counted in totals; bilateral_within_7d excludes records without paired_at and is a frozen lower bound for weeks folded into the aggregate"
  };
}
