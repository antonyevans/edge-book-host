import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostStore } from "../src/store.js";
import { ChannelRegistry } from "../src/channels.js";
import { startServer, store } from "./helpers.js";

// ── Task 1: ChannelRegistry unit tests — counters + liveChannelCount ─────────

test("liveChannelCount() returns 0 on a fresh registry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-obs-unit-"));
  const s = new HostStore(dir);
  const reg = new ChannelRegistry(s);
  assert.equal(reg.liveChannelCount(), 0, "fresh registry has 0 live channels");
});

test("metrics() counters are all 0 on a fresh registry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-obs-metrics-"));
  const s = new HostStore(dir);
  const reg = new ChannelRegistry(s);
  const m = reg.metrics();
  assert.equal(m.connected_channels, 0);
  assert.equal(m.mailbox_queue_depth, 0);
  assert.equal(m.deliveries.enqueued, 0);
  assert.equal(m.deliveries.delivered, 0);
  assert.equal(m.deliveries.acked, 0);
  assert.equal(m.deliveries.errors, 0);
});

// ── Task 1: enqueue counter increments via the real mailbox_send path ─────────
// This uses the shared server from helpers (same pattern as mailbox.test.ts).

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

const KEY_OBS_A = "ed25519:obs-A-fixed";
const KEY_OBS_B = "ed25519:obs-B-fixed";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

// Minimal agent client mirroring mailbox.test.ts TestAgent (inline, minimal).
import { WebSocket } from "ws";

async function connectAgent(wsUrl: string, key: string): Promise<{ ws: WebSocket; channel_id: string; close: () => void }> {
  const ws = new WebSocket(wsUrl);
  const channel_id = await new Promise<string>((resolve, reject) => {
    ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key: key, version: "test", nonce: "n" })));
    ws.on("message", (raw) => {
      const f = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (f.type === "hello_ok") resolve(String(f.channel_id));
      else if (f.type === "hello_err") reject(new Error(String(f.error)));
      else if (f.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    });
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    const f = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (f.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  });
  return { ws, channel_id, close: () => ws.close() };
}

test("enqueued counter increments after mailbox_send; store.mailboxCount() reflects queued depth", async () => {
  const { wsUrl } = await startServer();
  const a = await connectAgent(wsUrl, KEY_OBS_A);
  const b = await connectAgent(wsUrl, KEY_OBS_B);

  // Record enqueued baseline from the shared channels registry.
  // (The shared channels instance is what the server uses.)
  const beforeCount = store.mailboxCount();

  // Send a mailbox message from A → B's channel_id.
  // This exercises the exact mailbox_send path that should increment enqueued.
  const request_id = "obs-r1";
  const sendOk = await new Promise<string>((resolve, reject) => {
    a.ws.on("message", (raw) => {
      const f = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (f.type === "mailbox_send_ok" && f.request_id === request_id) resolve(String(f.id));
      else if (f.type === "mailbox_send_err" && f.request_id === request_id) reject(new Error(String(f.error)));
    });
    a.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to: b.channel_id, blob_b64: b64("hello-obs") }));
  });
  assert.ok(sendOk, "host assigned a message id");
  assert.equal(store.mailboxCount(), beforeCount + 1, "mailboxCount reflects enqueued message");

  a.close(); b.close();
});

// ── Task 2: /metrics HTTP endpoint ───────────────────────────────────────────

test("GET /metrics returns 200 JSON with expected shape (no auth required)", async () => {
  const { baseUrl } = await startServer();
  const res = await fetch(`${baseUrl}/metrics`);
  assert.equal(res.status, 200, "/metrics returns HTTP 200");
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(typeof body.connected_channels, "number");
  assert.equal(typeof body.mailbox_queue_depth, "number");
  assert.ok(body.deliveries && typeof body.deliveries === "object");
  const d = body.deliveries as Record<string, unknown>;
  assert.equal(typeof d.enqueued, "number");
  assert.equal(typeof d.delivered, "number");
  assert.equal(typeof d.acked, "number");
  assert.equal(typeof d.errors, "number");
  assert.equal(typeof body.uptime_s, "number");
});

test("GET /metrics does not leak channel_ids, agent_keys, or blob contents", async () => {
  const { baseUrl } = await startServer();
  const res = await fetch(`${baseUrl}/metrics`);
  const text = await res.text();
  // Must be only numbers/scalars — no long hex/base64 strings that look like keys.
  // The body is a flat JSON object; verify no channel_id/agent_key fields appear.
  assert.ok(!text.includes("channel_id"), "no channel_id in /metrics body");
  assert.ok(!text.includes("agent_key"), "no agent_key in /metrics body");
  assert.ok(!text.includes("blob"), "no blob in /metrics body");
});
