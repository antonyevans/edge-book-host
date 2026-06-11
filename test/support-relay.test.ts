// spec-134 / ea-claude-139 — operator support mailbox: SUPPORT_DID discovery
// route (fail-closed), frame-level size cap + per-sender rate limit for sends
// addressed to the support recipient, and normal relay of support envelopes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { SUPPORT_MAX_BLOB_BYTES, SUPPORT_SENDS_PER_WINDOW, SupportSendLimiter } from "../src/support.js";
import { startServer, fetchJson } from "./helpers.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); delete process.env.SUPPORT_DID; });

const SUPPORT_DID = "did:openclaw:support-operator-test";

function b64(s: string): string { return Buffer.from(s, "utf8").toString("base64"); }

interface DeliverFrame { id: string; from: string; blob_b64: string; ts: number; trace_id?: string }

// Minimal correct agent (pattern: test/trace-admin.test.ts TestAgent), with
// optional agent_did in the hello so a connected channel can be the
// SUPPORT_DID alias target, and mailbox_send_err capture.
class TestAgent {
  ws: WebSocket;
  channel_id = "";
  delivers: DeliverFrame[] = [];
  sendOks = new Map<string, string>();
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
          case "hello_ok": agent.channel_id = String(f.channel_id); resolve(); break;
          case "hello_err": reject(new Error(String(f.error || "hello_failed"))); break;
          case "ping": ws.send(JSON.stringify({ type: "pong" })); break;
          case "mailbox_deliver": agent.delivers.push(f as unknown as DeliverFrame); agent.wake(); break;
          case "mailbox_send_ok": agent.sendOks.set(String(f.request_id), String(f.id)); agent.wake(); break;
          case "mailbox_send_err": agent.sendErrs.set(String(f.request_id), String(f.error)); agent.wake(); break;
        }
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key, ...(agent_did ? { agent_did } : {}), version: "test", nonce: "n" })));
      ws.once("error", reject);
    });
    return agent;
  }

  private wake(): void { this.waiters.splice(0).forEach((w) => w()); }
  async until(cond: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
  }
  send(to: string, plaintext: string, request_id: string, trace_id?: string): void {
    this.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to, blob_b64: b64(plaintext), ...(trace_id ? { trace_id } : {}) }));
  }
  async outcome(request_id: string): Promise<{ ok: boolean; value: string }> {
    await this.until(() => this.sendOks.has(request_id) || this.sendErrs.has(request_id), `outcome ${request_id}`);
    return this.sendOks.has(request_id)
      ? { ok: true, value: this.sendOks.get(request_id)! }
      : { ok: false, value: this.sendErrs.get(request_id)! };
  }
  ack(id: string): void { this.ws.send(JSON.stringify({ type: "mailbox_ack", id })); }
  close(): void { this.ws.close(); }
}

test("GET /support/recipient fails closed when SUPPORT_DID is unset and returns the DID when set", async () => {
  const { baseUrl } = await startServer();
  delete process.env.SUPPORT_DID;
  const unset = await fetchJson(`${baseUrl}/support/recipient`);
  assert.equal(unset.status, 404, "unset SUPPORT_DID → 404, like any unknown route");

  process.env.SUPPORT_DID = SUPPORT_DID;
  try {
    const set = await fetchJson(`${baseUrl}/support/recipient`);
    assert.equal(set.status, 200);
    assert.deepEqual(set.body, { ok: true, did: SUPPORT_DID });
  } finally {
    delete process.env.SUPPORT_DID;
  }
});

test("support envelopes relay normally to the SUPPORT_DID agent; oversize support blobs are rejected but pass to other recipients", async () => {
  const { wsUrl } = await startServer();
  process.env.SUPPORT_DID = SUPPORT_DID;
  try {
    const operator = await TestAgent.connect(wsUrl, "ed25519:support-op-A", SUPPORT_DID);
    const user = await TestAgent.connect(wsUrl, "ed25519:support-user-A");
    const peer = await TestAgent.connect(wsUrl, "ed25519:support-peer-A");

    // Normal-size support send: relayed like any mailbox message (the host
    // resolves the DID alias to the operator's connected channel).
    user.send(SUPPORT_DID, "small-opaque-bundle", "s1", "trace_support_ok");
    const ok = await user.outcome("s1");
    assert.equal(ok.ok, true, "normal support send is enqueued");
    await operator.until(() => operator.delivers.length >= 1, "support deliver");
    assert.equal(operator.delivers[0]!.trace_id, "trace_support_ok");
    assert.equal(Buffer.from(operator.delivers[0]!.blob_b64, "base64").toString("utf8"), "small-opaque-bundle");
    operator.ack(ok.value);

    // Oversize blob to the support recipient: rejected at the frame level.
    const oversize = "x".repeat(SUPPORT_MAX_BLOB_BYTES + 1);
    user.send(SUPPORT_DID, oversize, "s2");
    const rejected = await user.outcome("s2");
    assert.equal(rejected.ok, false);
    assert.equal(rejected.value, "support_bundle_too_large");

    // The SAME blob to a non-support recipient passes (only the generic 8 MiB
    // mailbox cap applies) — the limit is scoped to the support mailbox.
    user.send(peer.channel_id, oversize, "s3");
    const passed = await user.outcome("s3");
    assert.equal(passed.ok, true, "oversize-for-support blob is fine for normal recipients");

    operator.close(); user.close(); peer.close();
  } finally {
    delete process.env.SUPPORT_DID;
  }
});

test("support sends are rate limited per sender channel; other senders keep their own budget", async () => {
  const { wsUrl } = await startServer();
  process.env.SUPPORT_DID = SUPPORT_DID;
  try {
    const spammer = await TestAgent.connect(wsUrl, "ed25519:support-spammer-B");
    const polite = await TestAgent.connect(wsUrl, "ed25519:support-polite-B");

    for (let i = 0; i < SUPPORT_SENDS_PER_WINDOW; i++) {
      spammer.send(SUPPORT_DID, `bundle-${i}`, `r${i}`);
      const outcome = await spammer.outcome(`r${i}`);
      assert.equal(outcome.ok, true, `send ${i + 1} of ${SUPPORT_SENDS_PER_WINDOW} within budget`);
    }
    spammer.send(SUPPORT_DID, "bundle-over", "r-over");
    const over = await spammer.outcome("r-over");
    assert.equal(over.ok, false);
    assert.equal(over.value, "support_rate_limited");

    // A different sender channel is unaffected.
    polite.send(SUPPORT_DID, "bundle-polite", "p1");
    const politeOutcome = await polite.outcome("p1");
    assert.equal(politeOutcome.ok, true, "rate limit is per sender channel");

    // Non-support traffic from the limited sender still flows.
    spammer.send(polite.channel_id, "normal-mail", "n1");
    const normal = await spammer.outcome("n1");
    assert.equal(normal.ok, true, "the limit applies only to support-addressed sends");

    spammer.close(); polite.close();
  } finally {
    delete process.env.SUPPORT_DID;
  }
});

test("SupportSendLimiter window resets after windowMs", () => {
  const limiter = new SupportSendLimiter(2, 1000);
  assert.equal(limiter.allow("ch", 0), true);
  assert.equal(limiter.allow("ch", 1), true);
  assert.equal(limiter.allow("ch", 2), false, "budget spent within the window");
  assert.equal(limiter.allow("ch", 1001), true, "fresh window after reset");
  assert.equal(limiter.allow("other", 2), true, "independent per-sender windows");
});
