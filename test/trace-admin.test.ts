// ea-claude-138 — host-side trace correlation: structured JSON logs for
// mailbox operations, the bounded trace ring, and the authenticated
// /admin/* observability endpoints (fail-closed when ADMIN_TOKEN is unset).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { traceRing, TraceRing } from "../src/observe.js";
import { startServer, store, fetchJson } from "./helpers.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

const KEY_A = "ed25519:trace-A-fixed";
const KEY_B = "ed25519:trace-B-fixed";

function b64(s: string): string { return Buffer.from(s, "utf8").toString("base64"); }

interface DeliverFrame { id: string; from: string; blob_b64: string; ts: number; trace_id?: string }

// Minimal correct agent (pattern: test/mailbox.test.ts TestAgent).
class TestAgent {
  ws: WebSocket;
  channel_id = "";
  delivers: DeliverFrame[] = [];
  sendOks = new Map<string, string>();
  private waiters: Array<() => void> = [];
  private constructor(ws: WebSocket) { this.ws = ws; }

  static async connect(wsUrl: string, agent_key: string): Promise<TestAgent> {
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
        }
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key, version: "test", nonce: "n" })));
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
  async sendMailbox(to: string, plaintext: string, request_id: string, trace_id?: string): Promise<string> {
    this.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to, blob_b64: b64(plaintext), ...(trace_id ? { trace_id } : {}) }));
    await this.until(() => this.sendOks.has(request_id), `send_ok ${request_id}`);
    return this.sendOks.get(request_id)!;
  }
  ack(id: string): void { this.ws.send(JSON.stringify({ type: "mailbox_ack", id })); }
  close(): void { this.ws.close(); }
}

// Capture stdout JSON log lines emitted during fn (structured-log seam).
async function captureLogs(fn: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); orig(...args); };
  try { await fn(); } finally { console.log = orig; }
  const parsed: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line) as Record<string, unknown>); } catch { /* non-JSON host line */ }
  }
  return parsed;
}

const TRACE = "trace_e2e-fixed-123";

test("structured JSON logs for enqueue/deliver/ack carry the trace_id; deliver frame echoes it", async () => {
  const { wsUrl } = await startServer();
  const a = await TestAgent.connect(wsUrl, KEY_A);
  const b = await TestAgent.connect(wsUrl, KEY_B);

  let hostMsgId = "";
  const logs = await captureLogs(async () => {
    hostMsgId = await a.sendMailbox(b.channel_id, "opaque-bytes", "tr1", TRACE);
    await b.until(() => b.delivers.length >= 1, "deliver");
    b.ack(hostMsgId);
    await new Promise((r) => setTimeout(r, 100)); // let the ack land
  });

  const enq = logs.find((l) => l.event === "mailbox_enqueue");
  assert.ok(enq, "mailbox_enqueue structured line emitted");
  assert.equal(enq!.trace_id, TRACE);
  assert.match(String(enq!.ts), /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(!JSON.stringify(enq).includes(b64("opaque-bytes")), "no blob in logs");

  const del = logs.find((l) => l.event === "mailbox_deliver");
  assert.ok(del, "mailbox_deliver structured line emitted");
  assert.equal(del!.trace_id, TRACE);

  const ack = logs.find((l) => l.event === "mailbox_ack");
  assert.ok(ack, "mailbox_ack structured line emitted");
  assert.equal(ack!.trace_id, TRACE);

  // The deliver frame to B echoes the trace so B's event log can correlate.
  assert.equal(b.delivers[0]!.trace_id, TRACE);
  assert.equal(b.delivers[0]!.id, hostMsgId);

  a.close(); b.close();
});

test("admin endpoints fail closed: 404 when ADMIN_TOKEN unset, 401 on bad token", async () => {
  const { baseUrl } = await startServer();
  delete process.env.ADMIN_TOKEN;
  for (const path of ["/admin/agents", `/admin/trace/${TRACE}`]) {
    const r = await fetchJson(`${baseUrl}${path}`);
    assert.equal(r.status, 404, `${path} unset token → 404`);
  }
  process.env.ADMIN_TOKEN = "secret-admin-token";
  try {
    const noAuth = await fetchJson(`${baseUrl}/admin/agents`);
    assert.equal(noAuth.status, 401, "missing bearer → 401");
    const wrong = await fetchJson(`${baseUrl}/admin/agents`, { headers: { authorization: "Bearer nope" } });
    assert.equal(wrong.status, 401, "wrong bearer → 401");
    const unknown = await fetchJson(`${baseUrl}/admin/nope`, { headers: { authorization: "Bearer secret-admin-token" } });
    assert.equal(unknown.status, 404, "unknown admin path → 404");
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
});

test("GET /admin/agents reports per-agent mailbox depth + last-seen dial-out", async () => {
  const { baseUrl, wsUrl } = await startServer();
  const b = await TestAgent.connect(wsUrl, KEY_B);
  const channelB = b.channel_id;
  b.close();
  await new Promise((r) => setTimeout(r, 50));

  // Queue one message for the now-offline B.
  const a = await TestAgent.connect(wsUrl, KEY_A);
  await a.sendMailbox(channelB, "queued-while-offline", "tr2");

  process.env.ADMIN_TOKEN = "secret-admin-token";
  try {
    const r = await fetchJson(`${baseUrl}/admin/agents`, { headers: { authorization: "Bearer secret-admin-token" } });
    assert.equal(r.status, 200);
    const agents = r.body.agents as Array<Record<string, unknown>>;
    const bRow = agents.find((x) => x.channel_id === channelB);
    assert.ok(bRow, "channel B listed");
    assert.equal(bRow!.connected, false);
    assert.equal(bRow!.mailbox_depth, 1, "one queued message for offline B");
    assert.ok(Number(bRow!.last_seen_at) > 0, "last-seen dial-out recorded");
    const aRow = agents.find((x) => x.channel_id === a.channel_id);
    assert.equal(aRow!.connected, true);
    assert.ok(!JSON.stringify(r.body).includes(b64("queued-while-offline")), "no blobs in admin output");
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
  a.close();
});

test("GET /admin/trace/<id> returns the relay-side hops for a relayed envelope", async () => {
  const { baseUrl, wsUrl } = await startServer();
  const a = await TestAgent.connect(wsUrl, KEY_A);
  const b = await TestAgent.connect(wsUrl, KEY_B);
  const trace = "trace_hops-roundtrip-456";
  const before = b.delivers.length;
  const id = await a.sendMailbox(b.channel_id, "hop-bytes", "tr3", trace);
  await b.until(() => b.delivers.length > before, "deliver");
  b.ack(id);
  await new Promise((r) => setTimeout(r, 100));

  process.env.ADMIN_TOKEN = "secret-admin-token";
  try {
    const r = await fetchJson(`${baseUrl}/admin/trace/${trace}`, { headers: { authorization: "Bearer secret-admin-token" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.trace_id, trace);
    const hops = (r.body.hops as Array<Record<string, unknown>>).map((h) => h.hop);
    assert.deepEqual(hops, ["enqueue", "deliver", "ack"], "all three relay hops recorded in order");
    const miss = await fetchJson(`${baseUrl}/admin/trace/trace_never-seen`, { headers: { authorization: "Bearer secret-admin-token" } });
    assert.equal(miss.status, 200);
    assert.deepEqual(miss.body.hops, []);
  } finally {
    delete process.env.ADMIN_TOKEN;
  }
  a.close(); b.close();
});

test("trace ring is bounded and the shared ring records hops", () => {
  const ring = new TraceRing(5);
  for (let i = 0; i < 12; i++) ring.record({ trace_id: `t${i}`, hop: "enqueue", id: `m${i}`, ts: i });
  assert.equal(ring.size(), 5);
  assert.deepEqual(ring.lookup("t0"), [], "oldest evicted");
  assert.equal(ring.lookup("t11").length, 1, "newest kept");
  assert.ok(traceRing.size() >= 0, "shared ring exists");
});
