import assert from "node:assert/strict";
import test from "node:test";
import type http from "node:http";
import { handleWerewolf, isWerewolfRequest, __resetForTest } from "../src/werewolf.ts";

// Minimal ServerResponse double capturing status/headers/body.
function mockRes() {
  const out: { status: number; headers: Record<string, string>; body: string } = { status: 0, headers: {}, body: "" };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) { out.status = status; if (headers) Object.assign(out.headers, headers); return res; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
    end(chunk?: string) { if (chunk) out.body += chunk; },
  } as unknown as http.ServerResponse;
  return { res, out };
}
function mockReq(method: string, auth?: string): http.IncomingMessage {
  return { method, headers: auth ? { authorization: auth } : {} } as unknown as http.IncomingMessage;
}
const u = (p: string) => new URL("http://h" + p);
const SNAP = JSON.stringify({ events: [{ kind: "say", channel: "town", from: "Brom", text: "hi" }], lobby: [{ name: "Brom", kind: "npc", alive: true }], phase: "DAY 1", status: "running", round: 1 });

test("isWerewolfRequest matches the namespace", async () => {
  assert.equal(isWerewolfRequest(u("/werewolf")), true);
  assert.equal(isWerewolfRequest(u("/werewolf/events")), true);
  assert.equal(isWerewolfRequest(u("/werewolfx")), false);
  assert.equal(isWerewolfRequest(u("/add")), false);
});

test("GET /werewolf serves the projector page with the narrator handle", async () => {
  __resetForTest();
  process.env.WEREWOLF_NARRATOR_HANDLE = "eddingham";
  const { res, out } = mockRes();
  await handleWerewolf(mockReq("GET"), res, u("/werewolf"));
  assert.equal(out.status, 200);
  assert.match(out.headers["content-type"], /text\/html/);
  assert.match(out.body, /Village Werewolf/);
  assert.match(out.body, /friend request eddingham/);
});

test("GET /werewolf/events returns the current snapshot", async () => {
  __resetForTest();
  const { res, out } = mockRes();
  await handleWerewolf(mockReq("GET"), res, u("/werewolf/events"));
  assert.equal(out.status, 200);
  const body = JSON.parse(out.body);
  assert.equal(body.phase, "LOBBY");
  assert.deepEqual(body.events, []);
});

test("POST /werewolf/events is fail-closed 404 when ADMIN_TOKEN unset", async () => {
  __resetForTest();
  delete process.env.ADMIN_TOKEN;
  const { res, out } = mockRes();
  await handleWerewolf(mockReq("POST"), res, u("/werewolf/events"), SNAP);
  assert.equal(out.status, 404);
});

test("POST /werewolf/events rejects a bad/missing token with 401", async () => {
  __resetForTest();
  process.env.ADMIN_TOKEN = "secret-token";
  const { res, out } = mockRes();
  await handleWerewolf(mockReq("POST", "Bearer wrong"), res, u("/werewolf/events"), SNAP);
  assert.equal(out.status, 401);
});

test("POST /werewolf/events accepts a valid push and GET reflects it", async () => {
  __resetForTest();
  process.env.ADMIN_TOKEN = "secret-token";
  const p = mockRes();
  await handleWerewolf(mockReq("POST", "Bearer secret-token"), p.res, u("/werewolf/events"), SNAP);
  assert.equal(p.out.status, 200);
  const g = mockRes();
  await handleWerewolf(mockReq("GET"), g.res, u("/werewolf/events"));
  const body = JSON.parse(g.out.body);
  assert.equal(body.phase, "DAY 1");
  assert.equal(body.events.length, 1);
  assert.equal(body.lobby[0].name, "Brom");
  assert.ok(body.updatedAt > 0);
});

test("POST /werewolf/events rejects malformed snapshots with 400", async () => {
  __resetForTest();
  process.env.ADMIN_TOKEN = "secret-token";
  const { res, out } = mockRes();
  await handleWerewolf(mockReq("POST", "Bearer secret-token"), res, u("/werewolf/events"), JSON.stringify({ nope: true }));
  assert.equal(out.status, 400);
});
