import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
