import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostStore } from "../src/store.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ebh-store-"));
}

test("pairing code is single-use", () => {
  const store = new HostStore(tmpDir());
  store.registerPairingCode("CODE-1234", "chan-A", 60_000);
  assert.equal(store.consumePairingCode("CODE-1234"), "chan-A");
  assert.equal(store.consumePairingCode("CODE-1234"), null);
});

test("pairing code expires on TTL", () => {
  const store = new HostStore(tmpDir());
  store.registerPairingCode("CODE-EXPI", "chan-A", 1);
  // Wait beyond TTL.
  const until = Date.now() + 10;
  while (Date.now() < until) { /* spin */ }
  assert.equal(store.consumePairingCode("CODE-EXPI"), null);
});

test("recordChannel preserves first_seen_at across reconnects; touchChannelActivity sets last_active_at (ea-061)", () => {
  const store = new HostStore(tmpDir());
  store.recordChannel({ channel_id: "chA", agent_key: "k", agent_did: null, first_seen_at: 1000, last_seen_at: 1000 });
  // Reconnect with a later first_seen_at — must NOT overwrite the original.
  store.recordChannel({ channel_id: "chA", agent_key: "k", agent_did: "did:x", first_seen_at: 9999, last_seen_at: 9999 });
  const c = store.getChannel("chA")!;
  assert.equal(c.first_seen_at, 1000, "first_seen_at is stable across reconnect");
  assert.equal(c.agent_did, "did:x", "other fields update");
  assert.equal(c.last_active_at, undefined, "no human activity yet");

  store.touchChannelActivity("chA", 5000);
  assert.equal(store.getChannel("chA")!.last_active_at, 5000);

  // touch on an unknown channel is a no-op (no throw).
  store.touchChannelActivity("nope", 5000);
  assert.equal(store.getChannel("nope"), null);
});

test("revokeChannelSessions drops all sessions and device tokens for a channel", () => {
  const store = new HostStore(tmpDir());
  store.createSession({ session_id: "s1", channel_id: "chA", csrf_token: "c", expires_at: Date.now() + 60_000 });
  store.createSession({ session_id: "s2", channel_id: "chA", csrf_token: "c", expires_at: Date.now() + 60_000 });
  store.createSession({ session_id: "s3", channel_id: "chB", csrf_token: "c", expires_at: Date.now() + 60_000 });
  store.createDeviceToken({ device_token: "d1", channel_id: "chA", expires_at: Date.now() + 60_000 });
  store.revokeChannelSessions("chA");
  assert.equal(store.getSession("s1"), null);
  assert.equal(store.getSession("s2"), null);
  assert.ok(store.getSession("s3"));
  assert.equal(store.getDeviceToken("d1"), null);
});

test("state persists across instances via state.json", () => {
  const dir = tmpDir();
  const a = new HostStore(dir);
  a.createSession({ session_id: "s1", channel_id: "chA", csrf_token: "c", expires_at: Date.now() + 60_000 });
  a.flushNow();
  const b = new HostStore(dir);
  assert.ok(b.getSession("s1"));
});
