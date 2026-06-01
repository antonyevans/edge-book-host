import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePairingCode, normalizePairingCode, channelIdFromKey, randomToken } from "../src/tokens.js";

test("generatePairingCode produces 4-4 format from unambiguous alphabet", () => {
  for (let i = 0; i < 50; i++) {
    const code = generatePairingCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(!code.includes("0"));
    assert.ok(!code.includes("O"));
    assert.ok(!code.includes("1"));
    assert.ok(!code.includes("I"));
  }
});

test("normalizePairingCode strips and re-groups", () => {
  assert.equal(normalizePairingCode("ab12 xy34"), "AB12-XY34");
  assert.equal(normalizePairingCode("AB12-XY34"), "AB12-XY34");
  assert.equal(normalizePairingCode("ab12xy34"), "AB12-XY34");
});

test("channelIdFromKey is stable hex of agent_key", () => {
  const a = channelIdFromKey("ed25519:abc");
  const b = channelIdFromKey("ed25519:abc");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("randomToken length scales with bytes", () => {
  const a = randomToken(16);
  const b = randomToken(32);
  assert.ok(a.length < b.length);
});
