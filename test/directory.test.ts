import assert from "node:assert/strict";
import test from "node:test";

let liveServerClose: (() => Promise<void>) | undefined;

test.after(async () => { if (liveServerClose) await liveServerClose(); });

test("GET /directory returns only discoverable handles with display_name + owner_label", async () => {
  const { startServer, store } = await import("./helpers.ts");
  const { baseUrl, close } = await startServer();
  liveServerClose = close;

  store.claimHandle({
    handle: "dir-alice",
    agent_did: "did:openclaw:dir-alice",
    card: { agent_id: "did:openclaw:dir-alice", display_name: "Alice Dir", owner_label: "Alice Human" },
    claim_sig: "s",
    discoverable: true,
  });
  store.claimHandle({
    handle: "dir-hidden",
    agent_did: "did:openclaw:dir-hidden",
    card: { agent_id: "did:openclaw:dir-hidden", display_name: "Hidden Dir" },
    claim_sig: "s",
    discoverable: false,
  });
  store.claimHandle({
    handle: "dir-bob",
    agent_did: "did:openclaw:dir-bob",
    card: { agent_id: "did:openclaw:dir-bob", display_name: "Bob Dir" },
    claim_sig: "s",
  });

  const res = await fetch(`${baseUrl}/directory`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);

  const data = await res.json() as { handles: Array<{ handle: string; display_name: string; owner_label?: string; claimed_at: number }>; total: number };
  const slugs = data.handles.map((h) => h.handle);
  assert.ok(slugs.includes("dir-alice"), "dir-alice must appear");
  assert.ok(slugs.includes("dir-bob"), "dir-bob must appear");
  assert.ok(!slugs.includes("dir-hidden"), "dir-hidden must be excluded");
  assert.equal(data.total, 2);

  const alice = data.handles.find((h) => h.handle === "dir-alice")!;
  assert.equal(alice.display_name, "Alice Dir");
  assert.equal(alice.owner_label, "Alice Human");
  assert.ok(typeof alice.claimed_at === "number");

  const bob = data.handles.find((h) => h.handle === "dir-bob")!;
  assert.equal(bob.display_name, "Bob Dir");
  assert.equal(bob.owner_label, undefined);
});

test("GET /directory pagination: limit + offset", async () => {
  const { startServer, store } = await import("./helpers.ts");
  const { baseUrl } = await startServer();

  for (let i = 0; i < 4; i++) {
    store.claimHandle({
      handle: `dir-page-${i}`,
      agent_did: `did:openclaw:page-${i}`,
      card: { agent_id: `did:openclaw:page-${i}`, display_name: `Page Agent ${i}` },
      claim_sig: "s",
    });
  }

  const r1 = await fetch(`${baseUrl}/directory?limit=2&offset=0`);
  const d1 = await r1.json() as { handles: Array<{ handle: string }>; total: number };
  assert.equal(d1.handles.length, 2);
  assert.ok(d1.total >= 4);

  const r2 = await fetch(`${baseUrl}/directory?limit=2&offset=2`);
  const d2 = await r2.json() as { handles: Array<{ handle: string }>; total: number };
  // No overlap with first page
  const p1 = new Set(d1.handles.map((h) => h.handle));
  assert.ok(!d2.handles.some((h) => p1.has(h.handle)));
});

test("GET /handle/:slug still resolves dir-hidden (non-discoverable)", async () => {
  const { startServer } = await import("./helpers.ts");
  const { baseUrl } = await startServer();

  const res = await fetch(`${baseUrl}/handle/dir-hidden`);
  assert.equal(res.status, 200);
  const card = await res.json() as { agent_id: string };
  assert.equal(card.agent_id, "did:openclaw:dir-hidden");
});
