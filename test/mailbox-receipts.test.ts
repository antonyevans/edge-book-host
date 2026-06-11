import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostStore } from "../src/store.js";

// ── spec-097 Part 1: store-unit tests (delivered_at + receipts ledger) ───────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ebh-receipts-"));
}

const TTL_MS = 60_000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function enqueue(store: HostStore, id: string, ts: number): void {
  store.enqueueMailbox({ id, to: "chan-B", from: "chan-A", blob: "AA==", ts }, TTL_MS);
}

test("markDelivered stamps delivered_at once; redelivery does not move it", () => {
  const store = new HostStore(tmpDir());
  enqueue(store, "m1", 1000);
  store.markDelivered("m1", 2000);
  store.markDelivered("m1", 3000); // redelivery on reconnect — first write wins
  assert.equal(store.getMailboxMessage("m1")?.delivered_at, 2000);
  // Unknown id is a safe no-op.
  store.markDelivered("nope", 2000);
});

test("wire shape from mailboxForRecipient never carries delivered_at or expires_at", () => {
  const store = new HostStore(tmpDir());
  enqueue(store, "m1", 1000);
  store.markDelivered("m1", 2000);
  const wire = store.mailboxForRecipient("chan-B", null, 1500);
  assert.equal(wire.length, 1);
  assert.ok(!("delivered_at" in wire[0]!), "delivered_at stripped from wire shape");
  assert.ok(!("expires_at" in wire[0]!), "expires_at stripped from wire shape");
});

test("ackMailbox records a receipt {acked_at,to,from} before deleting the message", () => {
  const store = new HostStore(tmpDir());
  enqueue(store, "m1", 1000);
  const to = store.ackMailbox("m1", 5000);
  assert.equal(to, "chan-B");
  assert.equal(store.getMailboxMessage("m1"), null, "message deleted on ack");
  assert.deepEqual(store.getReceipt("m1"), { acked_at: 5000, to: "chan-B", from: "chan-A" });
  assert.equal(store.receiptsCount(), 1);
  // Duplicate ack stays a no-op and does not resurrect or re-stamp.
  assert.equal(store.ackMailbox("m1", 9000), null);
  assert.equal(store.getReceipt("m1")?.acked_at, 5000);
});

test("restart-safety: acked receipt and delivered_at survive a store reload", () => {
  // Timestamps are anchored to the real clock: the reloading constructor runs
  // purge(Date.now()), so literal small epochs (e.g. 5000) would be older than
  // the receipts TTL and get purged at load — a false failure.
  const now = Date.now();
  const dir = tmpDir();
  const store = new HostStore(dir);
  enqueue(store, "m-acked", now);
  enqueue(store, "m-pushed", now);
  store.ackMailbox("m-acked", now);
  store.markDelivered("m-pushed", now);
  store.flushNow();
  const reloaded = new HostStore(dir);
  assert.deepEqual(reloaded.getReceipt("m-acked"), { acked_at: now, to: "chan-B", from: "chan-A" });
  assert.equal(reloaded.getMailboxMessage("m-pushed")?.delivered_at, now);
});

test("receipts ledger TTL: purge drops entries older than EDGE_BOOK_RECEIPT_TTL_MS (default 7d)", () => {
  const store = new HostStore(tmpDir());
  const now = Date.now();
  enqueue(store, "m-old", now);
  enqueue(store, "m-new", now);
  store.ackMailbox("m-old", now);
  store.ackMailbox("m-new", now + SEVEN_DAYS); // acked much later — survives the sweep below
  store.purge(now + SEVEN_DAYS + 1);
  assert.equal(store.getReceipt("m-old"), null, "expired receipt purged");
  assert.ok(store.getReceipt("m-new"), "fresh receipt survives");
});

test("receipts ledger cap: insert over 10_000 evicts the oldest by acked_at", () => {
  const store = new HostStore(tmpDir());
  for (let i = 0; i <= 10_000; i++) {
    enqueue(store, `m${i}`, i);
    store.ackMailbox(`m${i}`, i); // acked_at = i — strictly increasing order
  }
  assert.equal(store.receiptsCount(), 10_000, "ledger held at cap");
  assert.equal(store.getReceipt("m0"), null, "oldest entry evicted");
  assert.ok(store.getReceipt("m10000"), "newest entry present");
});
