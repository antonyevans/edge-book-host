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

// ── spec-097 Part 2: wire-level tests (TestAgent pattern, mailbox.test.ts) ───
import { WebSocket } from "ws";
import { startServer, store } from "./helpers.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

const KEY_A = "ed25519:receipts-A-fixed";
const KEY_B = "ed25519:receipts-B-fixed";
const KEY_C = "ed25519:receipts-C-fixed";

interface StatusEntry { id: string; state: string; queued_ms?: number; recipient_live?: boolean }
interface SendAck { id: string; recipient_live?: boolean }

// mailbox.test.ts TestAgent extended for spec-097: captures recipient_live on
// send acks and speaks the mailbox_status RPC pair.
class ReceiptAgent {
  ws: WebSocket;
  channel_id = "";
  delivers: Array<{ id: string }> = [];
  sendAcks = new Map<string, SendAck>();
  sendErrs = new Map<string, string>();
  statusOks = new Map<string, StatusEntry[]>();
  statusErrs = new Map<string, string>();
  private waiters: Array<() => void> = [];

  private constructor(ws: WebSocket) { this.ws = ws; }

  static async connect(wsUrl: string, agent_key: string, agent_did?: string): Promise<ReceiptAgent> {
    const ws = new WebSocket(wsUrl);
    const agent = new ReceiptAgent(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString()) as Record<string, unknown>;
        switch (f.type) {
          case "hello_ok":
            agent.channel_id = String(f.channel_id);
            resolve();
            break;
          case "hello_err":
            reject(new Error(String(f.error || "hello_failed")));
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          case "mailbox_deliver":
            agent.delivers.push({ id: String(f.id) });
            agent.wake();
            break;
          case "mailbox_send_ok":
            agent.sendAcks.set(String(f.request_id), {
              id: String(f.id),
              recipient_live: typeof f.recipient_live === "boolean" ? f.recipient_live : undefined
            });
            agent.wake();
            break;
          case "mailbox_send_err":
            agent.sendErrs.set(String(f.request_id), String(f.error));
            agent.wake();
            break;
          case "mailbox_status_ok":
            agent.statusOks.set(String(f.request_id), f.statuses as StatusEntry[]);
            agent.wake();
            break;
          case "mailbox_status_err":
            agent.statusErrs.set(String(f.request_id), String(f.error));
            agent.wake();
            break;
        }
      });
      ws.once("open", () => {
        const hello: Record<string, unknown> = { type: "hello", agent_key, version: "test", nonce: "n" };
        if (agent_did) hello.agent_did = agent_did;
        ws.send(JSON.stringify(hello));
      });
      ws.once("error", reject);
    });
    return agent;
  }

  private wake(): void { this.waiters.splice(0).forEach((w) => w()); }

  private async until(cond: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
  }

  async sendMailbox(to: string, plaintext: string, request_id: string): Promise<SendAck> {
    this.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to, blob_b64: Buffer.from(plaintext, "utf8").toString("base64") }));
    await this.until(() => this.sendAcks.has(request_id) || this.sendErrs.has(request_id), `send_ok ${request_id}`);
    const err = this.sendErrs.get(request_id);
    if (err) throw new Error(err);
    return this.sendAcks.get(request_id)!;
  }

  async status(ids: string[], request_id: string): Promise<StatusEntry[]> {
    this.ws.send(JSON.stringify({ type: "mailbox_status", request_id, ids }));
    await this.until(() => this.statusOks.has(request_id) || this.statusErrs.has(request_id), `status_ok ${request_id}`);
    const err = this.statusErrs.get(request_id);
    if (err) throw new Error(err);
    return this.statusOks.get(request_id)!;
  }

  async waitDelivers(n: number): Promise<void> { await this.until(() => this.delivers.length >= n, `${n} delivers`); }
  ack(id: string): void { this.ws.send(JSON.stringify({ type: "mailbox_ack", id })); }
  close(): void { this.ws.close(); }
}

test("mailbox_send_ok reports recipient_live=false for an offline recipient, true for an online one", async () => {
  const { wsUrl } = await startServer();
  // B connects once to register its channel, then goes offline.
  const b1 = await ReceiptAgent.connect(wsUrl, KEY_B);
  const channelB = b1.channel_id;
  b1.close();
  await new Promise((r) => setTimeout(r, 50));

  const a = await ReceiptAgent.connect(wsUrl, KEY_A);
  const offlineAck = await a.sendMailbox(channelB, "to-offline-B", "rl-1");
  assert.equal(offlineAck.recipient_live, false, "B is offline at enqueue time");

  const c = await ReceiptAgent.connect(wsUrl, KEY_C);
  const onlineAck = await a.sendMailbox(c.channel_id, "to-online-C", "rl-2");
  assert.equal(onlineAck.recipient_live, true, "C is connected at enqueue time");

  a.close(); c.close();
});

// ── KEYSTONE EXTENDED (spec-097): offline → status=queued → reconnect+deliver
// → status=delivered → ack → status=acked + unknown for a random id ──────────
test("receipts keystone: sender's mailbox_status tracks queued → delivered → acked", async () => {
  const { wsUrl } = await startServer();
  const b1 = await ReceiptAgent.connect(wsUrl, KEY_B);
  const channelB = b1.channel_id;
  b1.close();
  await new Promise((r) => setTimeout(r, 50));

  const a = await ReceiptAgent.connect(wsUrl, KEY_A);
  const ack = await a.sendMailbox(channelB, "receipts-keystone", "rk-1");

  // queued: in the mailbox, never pushed.
  const s1 = await a.status([ack.id], "rk-st1");
  assert.equal(s1[0]!.state, "queued");
  assert.ok(s1[0]!.queued_ms! >= 0, "queued_ms present and non-negative");
  assert.equal(s1[0]!.recipient_live, false);

  // delivered: B reconnects → host pushes → no ack yet.
  const b2 = await ReceiptAgent.connect(wsUrl, KEY_B);
  await b2.waitDelivers(1);
  const s2 = await a.status([ack.id], "rk-st2");
  assert.equal(s2[0]!.state, "delivered");
  assert.ok(s2[0]!.queued_ms! >= 0);
  assert.equal(s2[0]!.recipient_live, true);

  // acked: gone from the mailbox, present in the ledger; optional fields omitted.
  b2.ack(ack.id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.getMailboxMessage(ack.id), null, "acked message deleted from the mailbox");
  assert.ok(store.getReceipt(ack.id), "receipt recorded in the ledger");
  const s3 = await a.status([ack.id, "no-such-message-id"], "rk-st3");
  assert.equal(s3[0]!.state, "acked");
  assert.ok(!("queued_ms" in s3[0]!), "acked omits queued_ms (key absent, not null)");
  assert.ok(!("recipient_live" in s3[0]!), "acked omits recipient_live");
  assert.equal(s3[1]!.state, "unknown");
  assert.ok(!("queued_ms" in s3[1]!), "unknown omits queued_ms");

  a.close(); b2.close();
});

test("authorization fails closed: third agent AND the recipient both see unknown", async () => {
  const { wsUrl } = await startServer();
  const b1 = await ReceiptAgent.connect(wsUrl, KEY_B);
  const channelB = b1.channel_id;
  b1.close();
  await new Promise((r) => setTimeout(r, 50));

  const a = await ReceiptAgent.connect(wsUrl, KEY_A);
  const ack = await a.sendMailbox(channelB, "auth-probe", "auth-1");

  // Third agent C probing someone else's id learns nothing.
  const c = await ReceiptAgent.connect(wsUrl, KEY_C);
  const sc = await c.status([ack.id], "auth-st-c");
  assert.equal(sc[0]!.state, "unknown", "third party gets unknown, not the real state");

  // The RECIPIENT (non-sender) also gets unknown — only from === channel_id may read.
  const b2 = await ReceiptAgent.connect(wsUrl, KEY_B);
  await b2.waitDelivers(1); // delivered but NOT acked — still in the mailbox
  const sb = await b2.status([ack.id], "auth-st-b");
  assert.equal(sb[0]!.state, "unknown", "recipient gets unknown");

  // The sender still sees the truth.
  const sa = await a.status([ack.id], "auth-st-a");
  assert.equal(sa[0]!.state, "delivered");

  a.close(); b2.close(); c.close();
});

test("mailbox_status rejects malformed frames: missing ids, empty ids, >50 ids", async () => {
  const { wsUrl } = await startServer();
  const a = await ReceiptAgent.connect(wsUrl, KEY_A);

  a.ws.send(JSON.stringify({ type: "mailbox_status", request_id: "mf-1" })); // no ids
  a.ws.send(JSON.stringify({ type: "mailbox_status", request_id: "mf-2", ids: [] }));
  a.ws.send(JSON.stringify({ type: "mailbox_status", request_id: "mf-3", ids: Array.from({ length: 51 }, (_, i) => `x${i}`) }));
  const deadline = Date.now() + 2000;
  while (a.statusErrs.size < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(a.statusErrs.get("mf-1"), "invalid_mailbox_status");
  assert.equal(a.statusErrs.get("mf-2"), "invalid_mailbox_status");
  assert.equal(a.statusErrs.get("mf-3"), "invalid_mailbox_status");

  // Exactly 50 ids is accepted (bound is ≤50).
  const s = await a.status(Array.from({ length: 50 }, (_, i) => `x${i}`), "mf-4");
  assert.equal(s.length, 50);
  assert.ok(s.every((e) => e.state === "unknown"));

  a.close();
});

test("GET /metrics gains additive receipts_ledger_size and keeps the existing shape", async () => {
  const { baseUrl } = await startServer();
  const res = await fetch(`${baseUrl}/metrics`);
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(typeof body.connected_channels, "number");
  assert.equal(typeof body.mailbox_queue_depth, "number");
  assert.ok(body.deliveries && typeof body.deliveries === "object", "existing deliveries block unchanged");
  assert.equal(typeof body.receipts_ledger_size, "number", "additive receipts_ledger_size present");
});
