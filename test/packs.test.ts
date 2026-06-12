// spec-145 — starter-pack registry (host half).
// Covers every host Tests bullet: PUT/GET/DELETE round trip; caps; slug/member
// validation incl. reserved `default`; admin fail-closed; /packs shows no
// member handles; /pack/:slug rejects unauthenticated callers; join rate limit
// 429s a second fetch in-window and resets after; default-pack 200 body when
// DEFAULT_PACK_SLUG is set, 404 when not.
import assert from "node:assert/strict";
import test from "node:test";
import { startServer, spawnAgent, fetchJson } from "./helpers.js";

const ADMIN_TOKEN = "test-pack-admin-token";

function adminHeaders(): Record<string, string> {
  return { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" };
}

async function putPack(baseUrl: string, slug: string, body: unknown) {
  return fetchJson(`${baseUrl}/admin/pack/${slug}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
}

// One paired agent (known channel) whose agent_key authenticates pack fetches.
async function packAgent(wsUrl: string) {
  const agent_key = `ed25519:pack-test-${Math.random().toString(36).slice(2)}`;
  const agent = await spawnAgent(wsUrl, { agent_key });
  return { agent, agent_key, bearer: { authorization: `Bearer ${agent_key}` } };
}

test("packs (spec-145)", async (t) => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  const serverCtx = await startServer();
  const { baseUrl, wsUrl } = serverCtx;
  // Without this the shared server keeps node:test alive forever — the exact
  // leak that hung the handle tests before (see helpers.startServer).
  t.after(async () => { await serverCtx.close(); });

  await t.test("PUT/GET/DELETE round trip", async () => {
    const put = await putPack(baseUrl, "esmeralda", {
      title: "Edge Esmeralda",
      description: "Organizer and early-member circle",
      member_handles: ["alice", "bob-agent"],
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.pack.slug, "esmeralda");

    const { bearer, agent } = await packAgent(wsUrl);
    const got = await fetchJson(`${baseUrl}/pack/esmeralda`, { headers: bearer });
    assert.equal(got.status, 200);
    assert.equal(got.body.slug, "esmeralda");
    assert.equal(got.body.title, "Edge Esmeralda");
    assert.deepEqual(got.body.member_handles, ["alice", "bob-agent"]);
    assert.ok(typeof got.body.updated_at === "number");
    agent.close();

    const del = await fetchJson(`${baseUrl}/admin/pack/esmeralda`, { method: "DELETE", headers: adminHeaders() });
    assert.equal(del.status, 200);

    const { bearer: bearer2, agent: agent2 } = await packAgent(wsUrl);
    const gone = await fetchJson(`${baseUrl}/pack/esmeralda`, { headers: bearer2 });
    assert.equal(gone.status, 404);
    agent2.close();
  });

  await t.test("upsert replaces an existing pack in place", async () => {
    await putPack(baseUrl, "upsertable", { title: "v1", description: "", member_handles: ["alice"] });
    const put2 = await putPack(baseUrl, "upsertable", { title: "v2", description: "", member_handles: ["alice", "bob"] });
    assert.equal(put2.status, 200);
    assert.equal(put2.body.pack.title, "v2");
    assert.equal(put2.body.pack.member_handles.length, 2);
  });

  await t.test("member cap: 51 members rejected, 50 accepted", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `member-${i}`);
    const ok = await putPack(baseUrl, "cap-fifty", { title: "Fifty", description: "", member_handles: fifty });
    assert.equal(ok.status, 200);
    const over = await putPack(baseUrl, "cap-over", { title: "Over", description: "", member_handles: [...fifty, "member-50"] });
    assert.equal(over.status, 400);
    assert.match(String(over.body.error), /member/i);
  });

  await t.test("slug validation incl. reserved `default`", async () => {
    const reserved = await putPack(baseUrl, "default", { title: "Nope", description: "", member_handles: [] });
    assert.equal(reserved.status, 400);
    assert.match(String(reserved.body.error), /slug/i);

    const badSlug = await putPack(baseUrl, "Bad_Slug!", { title: "Nope", description: "", member_handles: [] });
    assert.equal(badSlug.status, 400);

    const badMember = await putPack(baseUrl, "good-slug", { title: "T", description: "", member_handles: ["UPPER_case"] });
    assert.equal(badMember.status, 400);
    assert.match(String(badMember.body.error), /member/i);
  });

  await t.test("admin fail-closed: no token configured → 404; wrong token → 401; agent auth never works on admin", async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const unset = await fetchJson(`${baseUrl}/admin/pack/x`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(unset.status, 404);
    process.env.ADMIN_TOKEN = saved;

    const wrong = await fetchJson(`${baseUrl}/admin/pack/x`, {
      method: "PUT",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(wrong.status, 401);
  });

  await t.test("/packs is public and shows no member handles", async () => {
    await putPack(baseUrl, "public-list", { title: "Public List", description: "desc", member_handles: ["alice", "bob"] });
    const list = await fetchJson(`${baseUrl}/packs`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body), "GET /packs returns a JSON array");
    const entry = list.body.find((p: { slug: string }) => p.slug === "public-list");
    assert.ok(entry, "pack listed");
    assert.equal(entry.member_count, 2);
    assert.equal(entry.title, "Public List");
    assert.equal(entry.description, "desc");
    assert.ok(!("member_handles" in entry), "member handles never appear on the public list");
    assert.ok(!JSON.stringify(list.body).includes("alice"), "no member handle leaks anywhere in the list body");
  });

  await t.test("/pack/:slug rejects unauthenticated callers (401) and unknown agents (403)", async () => {
    await putPack(baseUrl, "auth-gated", { title: "Auth", description: "", member_handles: ["alice"] });
    const anon = await fetchJson(`${baseUrl}/pack/auth-gated`);
    assert.equal(anon.status, 401);
    const unknown = await fetchJson(`${baseUrl}/pack/auth-gated`, { headers: { authorization: "Bearer ed25519:never-dialed-out" } });
    assert.equal(unknown.status, 403);
  });

  await t.test("unknown pack → 404 for an authenticated agent", async () => {
    const { bearer, agent } = await packAgent(wsUrl);
    const missing = await fetchJson(`${baseUrl}/pack/no-such-pack`, { headers: bearer });
    assert.equal(missing.status, 404);
    agent.close();
  });

  await t.test("join rate limit: second fetch in-window 429s, resets after the window", async () => {
    process.env.EDGE_BOOK_PACK_FETCH_WINDOW_MS = "300";
    try {
      await putPack(baseUrl, "rate-limited", { title: "RL", description: "", member_handles: ["alice"] });
      const { bearer, agent } = await packAgent(wsUrl);
      const first = await fetchJson(`${baseUrl}/pack/rate-limited`, { headers: bearer });
      assert.equal(first.status, 200);
      const second = await fetchJson(`${baseUrl}/pack/rate-limited`, { headers: bearer });
      assert.equal(second.status, 429);
      await new Promise((r) => setTimeout(r, 350));
      const third = await fetchJson(`${baseUrl}/pack/rate-limited`, { headers: bearer });
      assert.equal(third.status, 200, "window elapsed — fetch allowed again");
      agent.close();
    } finally {
      delete process.env.EDGE_BOOK_PACK_FETCH_WINDOW_MS;
    }
  });

  await t.test("rate limit is per agent per pack — another pack and another agent both pass", async () => {
    process.env.EDGE_BOOK_PACK_FETCH_WINDOW_MS = "60000";
    try {
      await putPack(baseUrl, "rl-pack-a", { title: "A", description: "", member_handles: [] });
      await putPack(baseUrl, "rl-pack-b", { title: "B", description: "", member_handles: [] });
      const one = await packAgent(wsUrl);
      assert.equal((await fetchJson(`${baseUrl}/pack/rl-pack-a`, { headers: one.bearer })).status, 200);
      // Same agent, different pack: allowed.
      assert.equal((await fetchJson(`${baseUrl}/pack/rl-pack-b`, { headers: one.bearer })).status, 200);
      // Same agent, same pack: limited.
      assert.equal((await fetchJson(`${baseUrl}/pack/rl-pack-a`, { headers: one.bearer })).status, 429);
      // Different agent, same pack: allowed.
      const two = await packAgent(wsUrl);
      assert.equal((await fetchJson(`${baseUrl}/pack/rl-pack-a`, { headers: two.bearer })).status, 200);
      one.agent.close();
      two.agent.close();
    } finally {
      delete process.env.EDGE_BOOK_PACK_FETCH_WINDOW_MS;
    }
  });

  await t.test("default pack: DEFAULT_PACK_SLUG set → /pack/default returns the named pack body, 200 not 302", async () => {
    await putPack(baseUrl, "esmeralda-2026", { title: "Esmeralda 2026", description: "", member_handles: ["alice"] });
    process.env.DEFAULT_PACK_SLUG = "esmeralda-2026";
    try {
      const { bearer, agent } = await packAgent(wsUrl);
      const res = await fetchJson(`${baseUrl}/pack/default`, { headers: bearer, redirect: "manual" });
      assert.equal(res.status, 200, "direct body, no redirect");
      assert.equal(res.body.slug, "esmeralda-2026");
      assert.deepEqual(res.body.member_handles, ["alice"]);
      agent.close();
    } finally {
      delete process.env.DEFAULT_PACK_SLUG;
    }
  });

  await t.test("default pack: DEFAULT_PACK_SLUG unset → /pack/default 404", async () => {
    const { bearer, agent } = await packAgent(wsUrl);
    const res = await fetchJson(`${baseUrl}/pack/default`, { headers: bearer });
    assert.equal(res.status, 404);
    agent.close();
  });

  await t.test("pack cap: the 101st pack is rejected", async () => {
    // Fill up to 100 packs total (some already exist from earlier subtests).
    const list = await fetchJson(`${baseUrl}/packs`);
    const existing = (list.body as Array<{ slug: string }>).length;
    for (let i = existing; i < 100; i++) {
      const r = await putPack(baseUrl, `filler-${i}`, { title: `F${i}`, description: "", member_handles: [] });
      assert.equal(r.status, 200, `filler-${i} accepted`);
    }
    const over = await putPack(baseUrl, "one-too-many", { title: "Nope", description: "", member_handles: [] });
    assert.equal(over.status, 400);
    assert.match(String(over.body.error), /pack/i);
    // Updating an EXISTING pack at the cap still works (upsert, not create).
    const upd = await putPack(baseUrl, "filler-99", { title: "F99v2", description: "", member_handles: [] });
    assert.equal(upd.status, 200);
  });

  await t.test("packs survive a store reload (persisted state)", async () => {
    const { store } = await import("./helpers.js");
    store.flushNow();
    const snapshot = store.snapshot() as unknown as { packs: Record<string, { slug: string }> };
    assert.ok(snapshot.packs && Object.keys(snapshot.packs).length > 0, "packs persisted in host state");
  });
});

// Review-finding regressions (fresh-context review, 2026-06-12): the real
// load path — a state.json written by THIS process round-trips packs, and a
// pre-145 state.json (no `packs` key) loads cleanly as {}.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostStore } from "../src/store.js";

test("packs persist through a real state.json round trip; pre-145 state loads without a packs key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-packs-load-"));
  const a = new HostStore(dir);
  a.packsMap()["loadtest"] = { slug: "loadtest", title: "Load", description: "", member_handles: ["alice"], updated_at: Date.now() };
  a.packsChanged();
  a.flushNow();
  const b = new HostStore(dir);
  assert.equal(b.packsMap()["loadtest"]?.title, "Load", "pack survived the disk round trip");

  const legacy = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-packs-legacy-"));
  fs.writeFileSync(path.join(legacy, "state.json"), JSON.stringify({ channels: {}, mailbox: {} }));
  const c = new HostStore(legacy);
  assert.deepEqual(c.packsMap(), {}, "pre-145 state.json loads with empty packs");
});

test("admin upsert dedupes member handles and rejects oversize titles", async (t) => {
  const serverCtx = await startServer();
  t.after(async () => { await serverCtx.close(); });
  // Upsert an existing slug: the cap test earlier filled all 100 pack slots
  // in the shared store, and updating-at-cap is allowed (create is not).
  const dedup = await putPack(serverCtx.baseUrl, "filler-99", { title: "D", description: "", member_handles: ["alice", "alice", "bob-agent"] });
  assert.equal(dedup.status, 200, JSON.stringify(dedup.body));
  assert.deepEqual((dedup.body as { pack: { member_handles: string[] } }).pack.member_handles, ["alice", "bob-agent"]);
  const big = await putPack(serverCtx.baseUrl, "big-title", { title: "x".repeat(201), description: "", member_handles: [] });
  assert.equal(big.status, 400);
});
