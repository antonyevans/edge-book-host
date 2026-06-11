import assert from "node:assert/strict";
import test, { after } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { isValidSlug, didFromPem, verifyHandleClaim, canonicalizeHost } from "../src/handles.ts";
import { HostStore } from "../src/store.ts";

function mkIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { pub, priv, did: didFromPem(pub) };
}
function sign(payload: unknown, priv: string): string {
  return crypto.sign(null, Buffer.from(canonicalizeHost(payload)), priv).toString("base64url");
}
function mkCard(id: { pub: string; priv: string; did: string }, handle: string) {
  const unsigned = {
    schema: "openclaw-agent-card/0.1", agent_id: id.did, handle, display_name: "X",
    card_url: "file://x", card_version: 1, card_hash: "h",
    public_keys: [{ id: id.did + "#main", type: "ed25519", public_key_pem: id.pub }],
    capabilities: [], transports: [], refresh_after: "", expires_at: "",
  };
  return { ...unsigned, signature: sign(unsigned, id.priv) };
}

test("isValidSlug accepts/rejects per regex", () => {
  assert.equal(isValidSlug("antony-evans"), true);
  assert.equal(isValidSlug("ab"), false);
  assert.equal(isValidSlug("-bad"), false);
  assert.equal(isValidSlug("Bad"), false);
  assert.equal(isValidSlug("metrics"), false);
});

test("verifyHandleClaim accepts a genuine card+claim", () => {
  const id = mkIdentity();
  const card = mkCard(id, "antony-evans");
  const claimed_at = 1700000000000;
  const claim_sig = sign({ handle: "antony-evans", agent_did: id.did, claimed_at }, id.priv);
  assert.equal(verifyHandleClaim(card, "antony-evans", claimed_at, claim_sig), "ok");
});

test("verifyHandleClaim rejects a tampered claim sig", () => {
  const id = mkIdentity();
  const card = mkCard(id, "antony-evans");
  const other = mkIdentity();
  const claimed_at = 1700000000000;
  const bad = sign({ handle: "antony-evans", agent_did: id.did, claimed_at }, other.priv);
  assert.equal(verifyHandleClaim(card, "antony-evans", claimed_at, bad), "bad_sig");
});

test("verifyHandleClaim rejects a card whose agent_id != derived DID", () => {
  const id = mkIdentity();
  const card = { ...mkCard(id, "antony-evans"), agent_id: "did:openclaw:not-derived" };
  const claimed_at = 1700000000000;
  const claim_sig = sign({ handle: "antony-evans", agent_did: card.agent_id, claimed_at }, id.priv);
  assert.equal(verifyHandleClaim(card as never, "antony-evans", claimed_at, claim_sig), "bad_card");
});

test("verifyHandleClaim rejects a card with a corrupted self-signature", () => {
  const id = mkIdentity();
  const card = mkCard(id, "antony-evans");
  card.signature = card.signature.slice(0, -4) + "AAAA"; // corrupt the card's own signature
  const claimed_at = 1700000000000;
  const claim_sig = sign({ handle: "antony-evans", agent_did: id.did, claimed_at }, id.priv);
  assert.equal(verifyHandleClaim(card, "antony-evans", claimed_at, claim_sig), "bad_card");
});

function tmpStore(): HostStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-store-"));
  return new HostStore(dir);
}
const REC = { handle: "antony-evans", agent_did: "did:openclaw:abc", card: { agent_id: "did:openclaw:abc" }, claim_sig: "s" };

test("claimHandle stores then resolves", () => {
  const s = tmpStore();
  assert.equal(s.claimHandle(REC), "ok");
  assert.equal(s.resolveHandle("antony-evans")?.agent_did, "did:openclaw:abc");
  assert.equal(s.resolveHandle("nope"), null);
});

test("claimHandle is idempotent for the same DID, taken for a different DID", () => {
  const s = tmpStore();
  assert.equal(s.claimHandle(REC), "ok");
  assert.equal(s.claimHandle({ ...REC, claim_sig: "s2" }), "ok");
  assert.equal(s.claimHandle({ ...REC, agent_did: "did:openclaw:other" }), "taken");
  assert.equal(s.resolveHandle("antony-evans")?.agent_did, "did:openclaw:abc");
});

test("isValidSlug rejects reserved handle 'directory'", () => {
  assert.equal(isValidSlug("directory"), false);
});

test("listHandles excludes discoverable:false records", () => {
  const s = tmpStore();
  s.claimHandle({ handle: "alice-smith", agent_did: "did:openclaw:a", card: { agent_id: "did:openclaw:a", display_name: "Alice" }, claim_sig: "s", discoverable: true, claimed_at: 1 });
  s.claimHandle({ handle: "hidden-user", agent_did: "did:openclaw:h", card: { agent_id: "did:openclaw:h", display_name: "Hidden" }, claim_sig: "s", discoverable: false, claimed_at: 2 });
  s.claimHandle({ handle: "default-user", agent_did: "did:openclaw:d", card: { agent_id: "did:openclaw:d", display_name: "Default" }, claim_sig: "s", claimed_at: 3 });
  const { handles, total } = s.listHandles({ offset: 0, limit: 100 });
  const slugs = handles.map((h) => h.handle);
  assert.ok(slugs.includes("alice-smith"), "discoverable:true should be listed");
  assert.ok(slugs.includes("default-user"), "missing discoverable should default to listed");
  assert.ok(!slugs.includes("hidden-user"), "discoverable:false should be excluded");
  assert.equal(total, 2);
});

test("listHandles paginates correctly", () => {
  const s = tmpStore();
  for (let i = 0; i < 5; i++) {
    s.claimHandle({ handle: `agent-${String(i).padStart(2, "0")}`, agent_did: `did:openclaw:${i}`, card: { agent_id: `did:openclaw:${i}`, display_name: `Agent ${i}` }, claim_sig: "s", claimed_at: i });
  }
  const page1 = s.listHandles({ offset: 0, limit: 2 });
  const page2 = s.listHandles({ offset: 2, limit: 2 });
  assert.equal(page1.handles.length, 2);
  assert.equal(page2.handles.length, 2);
  assert.equal(page1.total, 5);
  // No overlap between pages.
  const p1slugs = new Set(page1.handles.map((h) => h.handle));
  assert.ok(!page2.handles.some((h) => p1slugs.has(h.handle)));
});

test("resolveHandle still works for non-discoverable handles", () => {
  const s = tmpStore();
  s.claimHandle({ handle: "secret-handle", agent_did: "did:openclaw:h", card: { agent_id: "did:openclaw:h", display_name: "Hidden" }, claim_sig: "s", discoverable: false });
  const rec = s.resolveHandle("secret-handle");
  assert.ok(rec, "non-discoverable handle must still resolve via direct lookup");
  assert.equal(rec.agent_did, "did:openclaw:h");
});

// ── Live transport (spec-096, Task 3) ───────────────────────────────────────
// These exercise the real server: the GET /handle/:handle route and the
// handle_claim WS frame handled in channels.handleFrame. The shared server
// helper sets NODE_ENV=test + DATA_DIR and owns the listen() call. We import it
// lazily inside the tests so the pure-function tests above never spin a server.
//
// The helper server is a shared singleton (test/helpers.ts owns one listen()).
// Both live tests below reuse it, so we close it ONCE after the file finishes
// rather than per-test — closing it mid-file would break the second test.
let liveServerClose: (() => Promise<void>) | null = null;
after(async () => { if (liveServerClose) await liveServerClose(); });

test("GET /handle/:handle returns the card, 404 for unknown", async () => {
  // Real server-start helper (test/helpers.ts) — no startEdgeBookHost factory exists;
  // the server module is a singleton, so we use startServer() + the exported store.
  const { startServer, store } = await import("./helpers.ts");
  const { baseUrl, close } = await startServer();
  liveServerClose = close;
  store.claimHandle({
    handle: "antony-evans",
    agent_did: "did:openclaw:abc",
    card: { agent_id: "did:openclaw:abc", hello: "world" },
    claim_sig: "s",
  });
  const ok = await fetch(`${baseUrl}/handle/antony-evans`);
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { agent_id: string }).agent_id, "did:openclaw:abc");
  const miss = await fetch(`${baseUrl}/handle/nobody`);
  assert.equal(miss.status, 404);
  // Prototype-key keys must not resolve to an inherited Object.prototype member —
  // own-property check in resolveHandle keeps this a clean 404, not a malformed 200.
  const proto = await fetch(`${baseUrl}/handle/__proto__`);
  assert.equal(proto.status, 404);
});

// Minimal WS client that completes the hello handshake then captures
// handle_claim_ok / handle_claim_err replies. Modeled on mailbox.test.ts's TestAgent.
async function claimViaWs(
  wsUrl: string,
  frame: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ws = new WebSocket(wsUrl);
  const agent_key = `ed25519:handle-${Math.random().toString(36).slice(2)}`;
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key, version: "test", nonce: "n" })));
      ws.once("message", (raw) => {
        const f = JSON.parse(raw.toString());
        if (f.type === "hello_ok") resolve();
        else reject(new Error(f.error || "hello_failed"));
      });
      ws.once("error", reject);
    });
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("timeout waiting for handle_claim reply")), 2000);
      ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (f.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
        if (f.type === "handle_claim_ok" || f.type === "handle_claim_err") {
          clearTimeout(to);
          resolve(f);
        }
      });
      ws.send(JSON.stringify(frame));
    });
  } finally {
    ws.close();
  }
}

test("handle_claim frame: genuine claim → ok and stored; bad slug → bad_format; tampered sig → bad_sig", async () => {
  const { startServer, store } = await import("./helpers.ts");
  const { wsUrl, close } = await startServer();
  liveServerClose = close;

  // Genuine claim.
  const id = mkIdentity();
  const handle = "ws-claim-user";
  const card = mkCard(id, handle);
  const claimed_at = 1700000000001;
  const claim_sig = sign({ handle, agent_did: id.did, claimed_at }, id.priv);
  const okReply = await claimViaWs(wsUrl, { type: "handle_claim", request_id: "c1", handle, card, claimed_at, claim_sig });
  assert.equal(okReply.type, "handle_claim_ok");
  assert.equal(okReply.handle, handle);
  assert.equal(store.resolveHandle(handle)?.agent_did, id.did);

  // Invalid slug → bad_format (never reaches signature verification).
  const badSlug = await claimViaWs(wsUrl, {
    type: "handle_claim", request_id: "c2", handle: "Bad", card, claimed_at, claim_sig,
  });
  assert.equal(badSlug.type, "handle_claim_err");
  assert.equal(badSlug.reason, "bad_format");

  // Tampered claim_sig (signed by a different key) → bad_sig.
  const other = mkIdentity();
  const handle2 = "ws-claim-two";
  const card2 = mkCard(id, handle2);
  const badSig = sign({ handle: handle2, agent_did: id.did, claimed_at }, other.priv);
  const tampered = await claimViaWs(wsUrl, {
    type: "handle_claim", request_id: "c3", handle: handle2, card: card2, claimed_at, claim_sig: badSig,
  });
  assert.equal(tampered.type, "handle_claim_err");
  assert.equal(tampered.reason, "bad_sig");

  // Corrupted binding: card.agent_id no longer matches the DID derived from its
  // own pubkey, so verifyHandleClaim → bad_card. The claim_sig is genuine (signed
  // by the real key over the corrupted agent_did), proving we hit the card check.
  const id3 = mkIdentity();
  const handle3 = "ws-claim-three";
  const card3 = { ...mkCard(id3, handle3), agent_id: "did:openclaw:not-derived" };
  const claim_sig3 = sign({ handle: handle3, agent_did: card3.agent_id, claimed_at }, id3.priv);
  const badCard = await claimViaWs(wsUrl, {
    type: "handle_claim", request_id: "c4", handle: handle3, card: card3, claimed_at, claim_sig: claim_sig3,
  });
  assert.equal(badCard.type, "handle_claim_err");
  assert.equal(badCard.reason, "bad_card");
});
