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
});
