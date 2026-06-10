import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, fetchJson } from "./helpers.js";

// GET /health — minimal unauthenticated liveness probe (companion to /healthz,
// which backs the fly.toml http_check and carries channel metrics).

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

test("GET /health returns 200 with {status:'ok'} and no session required", async () => {
  const { status, body, headers } = await fetchJson(`${serverCtx!.baseUrl}/health`);
  assert.equal(status, 200, "health probe must be 200");
  assert.deepEqual(body, { status: "ok" }, "body is the minimal JSON probe");
  assert.match(headers.get("content-type") || "", /application\/json/);
});

test("GET /healthz still serves the fly http_check shape", async () => {
  const { status, body } = await fetchJson(`${serverCtx!.baseUrl}/healthz`);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.connected_channels, "number");
  assert.equal(typeof body.mailbox_queue_depth, "number");
});
