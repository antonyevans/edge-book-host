// spec-142 — activation-funnel instrumentation: metadata-derived stage stamps
// (paired / handle_claimed / first_send / bilateral), system-agent exclusion,
// boot-time backfill, bounded store with __aggregate__ fold, and the
// admin-token-gated /admin/funnel cohort report (small-cohort suppression).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { HostStore } from "../src/store.js";
import {
  AGGREGATE_ID,
  backfillFunnel,
  buildFunnelReport,
  enforceFunnelCap,
  isoWeek,
  recordHandleClaimed,
  recordPaired,
  recordSend,
  type FunnelAggregate,
  type FunnelRecord
} from "../src/funnel.js";
import { startServer, store, fetchJson } from "./helpers.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

function tmpStore(): HostStore {
  return new HostStore(fs.mkdtempSync(path.join(os.tmpdir(), "ebh-funnel-")));
}

function addChannel(s: HostStore, channel_id: string, agent_did: string | null, first_seen_at: number): void {
  s.recordChannel({ channel_id, agent_key: `key-${channel_id}`, agent_did, first_seen_at, last_seen_at: first_seen_at });
}

function rec(s: HostStore, id: string): FunnelRecord {
  const e = s.funnelEntries()[id];
  assert.ok(e, `funnel record ${id} exists`);
  assert.notEqual(e!.agent_id, AGGREGATE_ID);
  return e as FunnelRecord;
}

const b64 = (t: string): string => Buffer.from(t, "utf8").toString("base64");

// 2026-01-05 is a Monday → ISO week 2026-W02.
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

// --- isoWeek ---

test("isoWeek buckets by ISO-8601 week-year", () => {
  assert.equal(isoWeek(Date.UTC(2026, 0, 5)), "2026-W02");
  assert.equal(isoWeek(Date.UTC(2021, 0, 1)), "2020-W53", "Jan 1 2021 belongs to ISO week-year 2020");
  assert.equal(isoWeek(Date.UTC(2026, 5, 12)), "2026-W24");
});

// --- first-write-wins, incl. restart ---

test("each stage stamps once; repeats and restarts never overwrite", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-funnel-"));
  const s1 = new HostStore(dir);
  addChannel(s1, "chA", "did:key:alpha", T0);
  recordPaired(s1, "chA", T0);
  recordPaired(s1, "chA", T0 + DAY);
  recordHandleClaimed(s1, "did:key:alpha", T0 + 2 * DAY);
  recordHandleClaimed(s1, "did:key:alpha", T0 + 3 * DAY);
  recordSend(s1, "chA", "did:key:peer", T0 + 4 * DAY);
  recordSend(s1, "chA", "did:key:peer", T0 + 5 * DAY);
  const before = rec(s1, "did:key:alpha");
  assert.equal(before.paired_at, new Date(T0).toISOString());
  assert.equal(before.handle_claimed_at, new Date(T0 + 2 * DAY).toISOString());
  assert.equal(before.first_send_at, new Date(T0 + 4 * DAY).toISOString());
  s1.flushNow();

  // Restart: a fresh store over the same file must keep the original stamps
  // (no Date.now() regression on re-record).
  const s2 = new HostStore(dir);
  recordPaired(s2, "chA", T0 + 30 * DAY);
  recordSend(s2, "chA", "did:key:peer", T0 + 30 * DAY);
  const after2 = rec(s2, "did:key:alpha");
  assert.equal(after2.paired_at, new Date(T0).toISOString(), "paired_at survives restart unchanged");
  assert.equal(after2.first_send_at, new Date(T0 + 4 * DAY).toISOString(), "first_send_at survives restart unchanged");
});

// --- bilateral stamping ---

test("A→B then B→A stamps bilateral_at on BOTH; repeat A→B does not move it", () => {
  const s = tmpStore();
  addChannel(s, "chA", "did:key:a", T0);
  addChannel(s, "chB", "did:key:b", T0);
  // Mixed addressing: A sends to B's DID, B replies to A's channel_id — both
  // must canonicalize to the same identities.
  recordSend(s, "chA", "did:key:b", T0);
  assert.equal(rec(s, "did:key:a").bilateral_at, undefined, "one direction is not bilateral");
  recordSend(s, "chB", "chA", T0 + DAY);
  const stamped = new Date(T0 + DAY).toISOString();
  assert.equal(rec(s, "did:key:a").bilateral_at, stamped, "A stamped at the closing send");
  assert.equal(rec(s, "did:key:b").bilateral_at, stamped, "B stamped at the closing send");
  recordSend(s, "chA", "did:key:b", T0 + 10 * DAY);
  assert.equal(rec(s, "did:key:a").bilateral_at, stamped, "repeat send never re-stamps");
  assert.equal(rec(s, "did:key:b").bilateral_at, stamped);
});

test("race: A→B and B→A enqueued in the same synchronous tick both stamp (live sockets)", async () => {
  const { wsUrl } = await startServer();
  const connect = (agent_key: string, agent_did: string): Promise<{ ws: WebSocket; channel_id: string; oks: Set<string> }> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const oks = new Set<string>();
      ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (f.type === "hello_ok") resolve({ ws, channel_id: String(f.channel_id), oks });
        if (f.type === "hello_err") reject(new Error(String(f.error)));
        if (f.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
        if (f.type === "mailbox_send_ok") oks.add(String(f.request_id));
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key, agent_did, version: "test", nonce: "n" })));
      ws.once("error", reject);
    });
  const a = await connect("ed25519:funnel-race-A", "did:key:race-a");
  const b = await connect("ed25519:funnel-race-B", "did:key:race-b");
  // Fire both directions in the same tick — no await between the sends.
  a.ws.send(JSON.stringify({ type: "mailbox_send", request_id: "ra", to: b.channel_id, blob_b64: b64("x") }));
  b.ws.send(JSON.stringify({ type: "mailbox_send", request_id: "rb", to: a.channel_id, blob_b64: b64("y") }));
  const deadline = Date.now() + 2000;
  while ((!a.oks.has("ra") || !b.oks.has("rb")) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(a.oks.has("ra") && b.oks.has("rb"), "both sends acked");
  assert.ok(rec(store, "did:key:race-a").bilateral_at, "A stamped");
  assert.ok(rec(store, "did:key:race-b").bilateral_at, "B stamped");
  a.ws.close(); b.ws.close();
});

// --- system-agent exclusion ---

test("traffic to/from SUPPORT_DID never stamps bilateral_at, either direction", () => {
  const s = tmpStore();
  addChannel(s, "chU", "did:key:user1", T0);
  addChannel(s, "chS", "did:key:support", T0);
  process.env.SUPPORT_DID = "did:key:support";
  try {
    recordSend(s, "chU", "did:key:support", T0);
    recordSend(s, "chS", "did:key:user1", T0 + 1000);
    recordSend(s, "chU", "did:key:support", T0 + 2000);
    assert.equal(rec(s, "did:key:user1").bilateral_at, undefined, "user not activated by support auto-reply");
    assert.equal(rec(s, "did:key:support").bilateral_at, undefined, "support never activated");
    assert.ok(rec(s, "did:key:user1").first_send_at, "first_send_at still an honest stamp");
  } finally {
    delete process.env.SUPPORT_DID;
  }
});

test("the greeter (handle-registry DID) is excluded by default; FUNNEL_EXCLUDE_DIDS extends the set", () => {
  const s = tmpStore();
  addChannel(s, "chG", "did:key:greet", T0);
  addChannel(s, "chU", "did:key:user2", T0);
  addChannel(s, "chX", "did:key:other-system", T0);
  s.claimHandle({ handle: "greeter", agent_did: "did:key:greet", card: {}, claim_sig: "sig", claimed_at: T0 });
  recordSend(s, "chU", "did:key:greet", T0);
  recordSend(s, "chG", "did:key:user2", T0 + 1000);
  recordSend(s, "chU", "did:key:greet", T0 + 2000);
  assert.equal(rec(s, "did:key:user2").bilateral_at, undefined, "greeter auto-reply never activates a newcomer");
  assert.equal(rec(s, "did:key:greet").bilateral_at, undefined);

  process.env.FUNNEL_EXCLUDE_DIDS = "did:key:other-system, did:key:unused";
  try {
    recordSend(s, "chU", "did:key:other-system", T0 + 3000);
    recordSend(s, "chX", "did:key:user2", T0 + 4000);
    recordSend(s, "chU", "did:key:other-system", T0 + 5000);
    assert.equal(rec(s, "did:key:user2").bilateral_at, undefined, "env-listed DID excluded");
    assert.equal(rec(s, "did:key:other-system").bilateral_at, undefined);
  } finally {
    delete process.env.FUNNEL_EXCLUDE_DIDS;
  }
});

// --- boot-time backfill ---

test("backfill: pre-existing channels land in their historical cohort; post-deploy stages attach", () => {
  const s = tmpStore();
  const historical = Date.UTC(2025, 10, 3, 9, 0, 0); // 2025-11-03 Monday → 2025-W45
  addChannel(s, "chOld", "did:key:old", historical);
  backfillFunnel(s);
  const r = rec(s, "did:key:old");
  assert.equal(r.first_seen_at, new Date(historical).toISOString(), "cohort key = channel first_seen_at");
  assert.equal(r.paired_at, undefined, "no stage fields synthesized");
  // Running backfill again must not reset anything.
  recordPaired(s, "chOld", T0);
  backfillFunnel(s);
  assert.equal(rec(s, "did:key:old").paired_at, new Date(T0).toISOString(), "post-deploy stage attached to the backfilled record");
  const report = buildFunnelReport(s);
  assert.ok(report.cohorts.some((c) => c.week === "2025-W45"), "historical cohort present");
});

// --- eviction / __aggregate__ fold ---

test("eviction at cap folds oldest cohorts into __aggregate__; totals identical before/after; aggregate never evicted", () => {
  const s = tmpStore();
  // Six records across two weeks, with stages.
  for (let i = 0; i < 4; i++) recordPaired(s, `did:key:e${i}`, T0 + i * 1000); // 2026-W02
  for (let i = 4; i < 6; i++) recordPaired(s, `did:key:e${i}`, T0 + 7 * DAY + i * 1000); // 2026-W03
  // One folded-away record gets a within-7d bilateral so the fold must carry it.
  (rec(s, "did:key:e0")).bilateral_at = new Date(T0 + DAY).toISOString();
  const totalsBefore = buildFunnelReport(s).totals;
  assert.equal(totalsBefore.paired, 6);
  assert.equal(totalsBefore.bilateral_within_7d, 1);

  process.env.EDGE_BOOK_FUNNEL_CAP = "3";
  try {
    enforceFunnelCap(s);
    const entries = s.funnelEntries();
    const liveRecords = Object.values(entries).filter((e) => e.agent_id !== AGGREGATE_ID);
    assert.equal(liveRecords.length, 3, "capped to 3 live records");
    const agg = entries[AGGREGATE_ID] as FunnelAggregate;
    assert.ok(agg, "__aggregate__ row exists");
    assert.equal(agg.weeks["2026-W02"]?.paired, 3, "oldest-cohort-first fold");
    assert.equal(agg.weeks["2026-W02"]?.bilateral_within_7d, 1, "within-7d computed at fold time");
    assert.deepEqual(buildFunnelReport(s).totals, totalsBefore, "totals identical before/after fold");

    // Aggregate itself is never evicted by further pressure.
    recordPaired(s, "did:key:e6", T0 + 14 * DAY);
    enforceFunnelCap(s);
    assert.ok(s.funnelEntries()[AGGREGATE_ID], "__aggregate__ survives further eviction");
    assert.equal(buildFunnelReport(s).totals.paired, 7);
  } finally {
    delete process.env.EDGE_BOOK_FUNNEL_CAP;
  }
});

// --- /admin/funnel ---

test("/admin/funnel fails closed: 404 when ADMIN_TOKEN unset", async () => {
  const { baseUrl } = await startServer();
  delete process.env.ADMIN_TOKEN;
  const r = await fetchJson(`${baseUrl}/admin/funnel`);
  assert.equal(r.status, 404);
});

test("/admin/funnel: ISO-week cohorts, small-cohort suppression, within-7d rules, no DIDs", async () => {
  const { baseUrl } = await startServer();
  process.env.ADMIN_TOKEN = "secret-admin-token";
  const auth = { headers: { authorization: "Bearer secret-admin-token" } };
  try {
    const baseline = (await fetchJson(`${baseUrl}/admin/funnel`, auth)).body.totals as Record<string, number>;

    // Seed 2026-W02 (visible: paired = 5): five paired records; 3 claimed a
    // handle; 2 sent; 2 reached bilateral (one within 7d, one after 10d);
    // plus one backfilled record (no paired_at) with bilateral.
    const entries = store.funnelEntries();
    const iso = (ms: number): string => new Date(ms).toISOString();
    for (let i = 0; i < 5; i++) {
      const r: FunnelRecord = { agent_id: `did:key:cohort${i}`, first_seen_at: iso(T0 + i), paired_at: iso(T0 + i) };
      if (i < 3) r.handle_claimed_at = iso(T0 + DAY);
      if (i < 2) r.first_send_at = iso(T0 + 2 * DAY);
      if (i === 0) r.bilateral_at = iso(T0 + 3 * DAY);      // within 7d
      if (i === 1) r.bilateral_at = iso(T0 + 10 * DAY);     // outside 7d
      entries[r.agent_id] = r;
    }
    // Backfilled pre-existing agent: bilateral but NO paired_at — counts in
    // `bilateral`, excluded from `bilateral_within_7d`.
    entries["did:key:cohort-backfilled"] = {
      agent_id: "did:key:cohort-backfilled", first_seen_at: iso(T0 + 6), bilateral_at: iso(T0 + DAY)
    };
    // Seed 2025-W50 (2025-12-08 Monday) with a single paired record → suppressed.
    const tiny = Date.UTC(2025, 11, 8, 12, 0, 0);
    entries["did:key:cohort-tiny"] = { agent_id: "did:key:cohort-tiny", first_seen_at: iso(tiny), paired_at: iso(tiny) };
    store.funnelChanged();

    const r = await fetchJson(`${baseUrl}/admin/funnel`, auth);
    assert.equal(r.status, 200);
    const cohorts = r.body.cohorts as Array<Record<string, unknown>>;
    const w02 = cohorts.find((c) => c.week === "2026-W02");
    assert.deepEqual(w02, { week: "2026-W02", paired: 5, handle_claimed: 3, first_send: 2, bilateral: 3, bilateral_within_7d: 1 });
    const w50 = cohorts.find((c) => c.week === "2025-W50");
    assert.deepEqual(w50, { week: "2025-W50", suppressed: true }, "paired < 5 → suppressed, counts withheld");
    const totals = r.body.totals as Record<string, number>;
    assert.equal(totals.paired, (baseline.paired ?? 0) + 6, "suppressed cohort still contributes to totals");
    assert.equal(totals.bilateral, (baseline.bilateral ?? 0) + 3);
    assert.equal(totals.bilateral_within_7d, (baseline.bilateral_within_7d ?? 0) + 1);
    assert.ok(!JSON.stringify(r.body).includes("did:key:cohort"), "no DIDs anywhere in the response");
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
});

// --- best-effort posture ---

test("funnel write failures never fail the wrapped operation (mailbox_send still succeeds)", async () => {
  const { wsUrl } = await startServer();
  const original = store.funnelEntries.bind(store);
  (store as unknown as { funnelEntries: () => never }).funnelEntries = () => { throw new Error("funnel boom"); };
  try {
    const ws = new WebSocket(wsUrl);
    const result = await new Promise<string>((resolve, reject) => {
      ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (f.type === "hello_ok") {
          ws.send(JSON.stringify({ type: "mailbox_send", request_id: "be1", to: "did:key:whoever", blob_b64: b64("z") }));
        }
        if (f.type === "mailbox_send_ok") resolve(String(f.id));
        if (f.type === "mailbox_send_err") reject(new Error(String(f.error)));
        if (f.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key: "ed25519:funnel-besteffort", version: "test", nonce: "n" })));
      ws.once("error", reject);
      setTimeout(() => reject(new Error("timeout waiting for mailbox_send_ok")), 2000).unref();
    });
    assert.ok(result, "send acked despite funnel store throwing");
    ws.close();
  } finally {
    (store as unknown as { funnelEntries: typeof original }).funnelEntries = original;
  }
});

// Public-surface guard (spec-142 §3): signup velocity and activation rate are
// not public information — a future middleware that accidentally exports a
// funnel counter must fail this test, not a privacy review.
test("GET /metrics (no auth) exposes nothing funnel-related", async () => {
  const { baseUrl } = await startServer();
  const res = await fetch(`${baseUrl}/metrics`);
  assert.equal(res.status, 200);
  const raw = (await res.text()).toLowerCase();
  for (const banned of ["funnel", "paired", "bilateral", "activation"]) {
    assert.ok(!raw.includes(banned), `public /metrics must not contain "${banned}"`);
  }
});

// Review-finding regressions (fresh-context review, 2026-06-12).
test("bilateral stamps even when the sender's peers_sent list is at cap", async () => {
  const s = tmpStore();
  addChannel(s, "ch-full", "did:test:full", 1000);
  addChannel(s, "ch-rev", "did:test:rev", 1000);
  recordPaired(s, "ch-full", 1000);                            // sender's record exists
  recordSend(s, "ch-rev", "did:test:full", 2000);             // reverse direction exists
  const full = rec(s, "did:test:full");
  full.peers_sent = Array.from({ length: 200 }, (_, i) => `did:test:filler-${i}`); // cap reached
  recordSend(s, "ch-full", "did:test:rev", 3000);             // forward send at cap
  assert.ok(rec(s, "did:test:full").bilateral_at, "sender stamped despite full list");
  assert.ok(rec(s, "did:test:rev").bilateral_at, "peer stamped despite full list");
});

test("orphan channel-id record reconciles into the DID record when the DID lands", async () => {
  const s = tmpStore();
  addChannel(s, "ch-late", null, 1000);                        // paired before DID known
  recordPaired(s, "ch-late", 1000);
  assert.ok(s.funnelEntries()["ch-late"], "orphan keyed by channel_id");
  s.recordChannel({ channel_id: "ch-late", agent_key: "key-ch-late", agent_did: "did:test:late", first_seen_at: 1000, last_seen_at: 2000 });
  recordHandleClaimed(s, "did:test:late", 2000);               // canonicalization reconciles
  const merged = rec(s, "did:test:late");
  assert.ok(merged.paired_at, "paired stage carried from the orphan");
  assert.ok(merged.handle_claimed_at, "new stage on the merged record");
  assert.equal(s.funnelEntries()["ch-late"], undefined, "orphan removed — one agent, one record");
});

test("non-positive EDGE_BOOK_FUNNEL_CAP falls back to the default instead of evicting everything", async () => {
  const s = tmpStore();
  process.env.EDGE_BOOK_FUNNEL_CAP = "-1";
  try {
    addChannel(s, "ch-cap", "did:test:cap", 1000);
    recordPaired(s, "ch-cap", 1000);
    assert.ok(rec(s, "did:test:cap"), "record survives a misconfigured cap");
  } finally {
    delete process.env.EDGE_BOOK_FUNNEL_CAP;
  }
});
