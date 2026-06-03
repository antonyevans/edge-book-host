import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { HostStore } from "../src/store.js";
import { startServer, store } from "./helpers.js";

// Close the shared helper server when this file's tests finish so the test
// process can exit cleanly (mirrors test/integration.test.ts).
let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

const KEY_A = "ed25519:mailbox-A-fixed";
const KEY_B = "ed25519:mailbox-B-fixed";
const KEY_C = "ed25519:mailbox-C-fixed";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

interface DeliverFrame { id: string; from: string; blob_b64: string; ts: number }

// A correct edge-book agent client: ONE persistent frame handler installed
// before the hello handshake, so frame ordering relative to hello_ok never
// races (the bug the old two-stage helper had). Models ea-claude-065's client.
class TestAgent {
  ws: WebSocket;
  channel_id = "";
  delivers: DeliverFrame[] = [];
  sendOks = new Map<string, string>(); // request_id -> message id
  sendErrs = new Map<string, string>();
  private waiters: Array<() => void> = [];

  private constructor(ws: WebSocket) { this.ws = ws; }

  static async connect(wsUrl: string, agent_key: string, agent_did?: string): Promise<TestAgent> {
    const ws = new WebSocket(wsUrl);
    const agent = new TestAgent(ws);
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
            agent.delivers.push(f as unknown as DeliverFrame);
            agent.wake();
            break;
          case "mailbox_send_ok":
            agent.sendOks.set(String(f.request_id), String(f.id));
            agent.wake();
            break;
          case "mailbox_send_err":
            agent.sendErrs.set(String(f.request_id), String(f.error));
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

  async sendMailbox(to: string, plaintext: string, request_id: string): Promise<string> {
    this.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to, blob_b64: b64(plaintext) }));
    await this.until(() => this.sendOks.has(request_id) || this.sendErrs.has(request_id), `send_ok ${request_id}`);
    const err = this.sendErrs.get(request_id);
    if (err) throw new Error(err);
    return this.sendOks.get(request_id)!;
  }

  async waitDelivers(n: number): Promise<void> { await this.until(() => this.delivers.length >= n, `${n} delivers`); }
  ack(id: string): void { this.ws.send(JSON.stringify({ type: "mailbox_ack", id })); }
  close(): void { this.ws.close(); }
}

// ── KEYSTONE: A → host → offline B → reconnect → deliver → ack → delete ──────
test("keystone: offline recipient receives queued envelope on reconnect, then ack deletes it", async () => {
  const { wsUrl } = await startServer();
  const PLAINTEXT = "opaque-signed-envelope-bytes-🔒";

  // B connects once to register its channel, then goes offline.
  const b1 = await TestAgent.connect(wsUrl, KEY_B);
  const channelB = b1.channel_id;
  b1.close();
  await new Promise((r) => setTimeout(r, 50)); // let detach settle

  // A sends an opaque blob addressed to B while B is offline.
  const a = await TestAgent.connect(wsUrl, KEY_A);
  const id = await a.sendMailbox(channelB, PLAINTEXT, "r1");
  assert.ok(id, "host assigned a message id");
  assert.equal(store.mailboxCount(), 1, "message is queued while B is offline");

  // B reconnects with the SAME key → same channel → host flushes the queue.
  const b2 = await TestAgent.connect(wsUrl, KEY_B);
  assert.equal(b2.channel_id, channelB, "reconnect yields the same channel_id");
  await b2.waitDelivers(1);

  const delivered = b2.delivers[0]!;
  assert.equal(delivered.id, id, "delivered id matches the enqueued id");
  assert.equal(delivered.from, a.channel_id, "from is host-stamped to A's channel");
  assert.equal(Buffer.from(delivered.blob_b64, "base64").toString("utf8"), PLAINTEXT, "blob round-trips intact");

  // B acks → host deletes.
  b2.ack(id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.mailboxCount(), 0, "message deleted after ack");

  a.close(); b2.close();
});

// ── Immediate delivery when the recipient is already online ──────────────────
test("online recipient gets immediate delivery without reconnect", async () => {
  const { wsUrl } = await startServer();
  const b = await TestAgent.connect(wsUrl, KEY_B + "-online");
  const a = await TestAgent.connect(wsUrl, KEY_A + "-online");

  const id = await a.sendMailbox(b.channel_id, "hi-online", "r2");
  await b.waitDelivers(1);
  assert.equal(b.delivers[0]!.id, id);

  b.ack(id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.mailboxCount(), 0);
  a.close(); b.close();
});

// ── A non-recipient cannot ack/delete someone else's message (fail-closed) ───
test("a non-recipient ack does not delete the message", async () => {
  const { wsUrl } = await startServer();
  const b = await TestAgent.connect(wsUrl, KEY_B + "-auth");
  const a = await TestAgent.connect(wsUrl, KEY_A + "-auth");
  const c = await TestAgent.connect(wsUrl, KEY_C + "-auth");

  const id = await a.sendMailbox(b.channel_id, "for-B-only", "r3");
  const before = store.mailboxCount();

  // C tries to ack B's message — must be ignored.
  c.ack(id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.mailboxCount(), before, "non-recipient ack is rejected; message survives");

  // The rightful recipient can still ack.
  b.ack(id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.mailboxCount(), before - 1, "recipient ack deletes it");
  a.close(); b.close(); c.close();
});

// ── Queue survives a host restart (store reloads from disk) ──────────────────
test("queued mailbox messages survive a store restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-mailbox-"));
  const s1 = new HostStore(dir);
  s1.enqueueMailbox({ id: "m1", to: "chanB", from: "chanA", blob: b64("durable"), ts: Date.now() }, 60_000);
  s1.flushNow();

  const s2 = new HostStore(dir); // simulate restart
  const queued = s2.mailboxForRecipient("chanB", null);
  assert.equal(queued.length, 1, "message reloaded from disk after restart");
  assert.equal(queued[0]!.id, "m1");
  assert.equal(Buffer.from(queued[0]!.blob, "base64").toString("utf8"), "durable");
  // Wire shape only — no host-internal expires_at leaks.
  assert.ok(!("expires_at" in queued[0]!), "wire MailboxMessage has no expires_at");

  assert.equal(s2.ackMailbox("m1"), "chanB", "ack returns the addressed recipient");
  assert.equal(s2.mailboxForRecipient("chanB", null).length, 0, "ack removed it");
});

// ── DID-alias addressing matches the recipient (store-level) ─────────────────
// A sender may address a recipient by its DID rather than channel_id; the host
// resolves both forms. `mailboxForRecipient` is the matcher the live registry
// uses in deliverQueued().
test("a message addressed to a DID alias is matched for the channel that owns that DID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-did-"));
  const s = new HostStore(dir);
  const did = "did:openclaw:alias-test";
  s.enqueueMailbox({ id: "d1", to: did, from: "chanA", blob: b64("by-did"), ts: Date.now() }, 60_000);

  // Matches when the connecting channel owns that DID alias.
  assert.equal(s.mailboxForRecipient("chanB", did).length, 1, "DID alias matches");
  // Does not match a different channel with no matching DID.
  assert.equal(s.mailboxForRecipient("chanB", null).length, 0, "no alias, no match");
  assert.equal(s.mailboxForRecipient("chanX", "did:openclaw:someone-else").length, 0, "wrong DID, no match");
});
