import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostStore } from "../src/store.js";
import { startServer, spawnAgent } from "./helpers.js";

// ── Store-level: list + revoke are channel-scoped and leak no secret token ───
test("listDevices + revokeDeviceById are channel-scoped (ea-claude-057)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-devices-"));
  const s = new HostStore(dir);
  const now = Date.now();
  s.createDeviceToken({ device_token: "secret1", channel_id: "A", expires_at: now + 1e6, device_id: "d1", label: "Chrome on Linux", created_at: now, last_seen_at: now });
  s.createDeviceToken({ device_token: "secret2", channel_id: "A", expires_at: now + 1e6, device_id: "d2", label: "Safari on iPhone", created_at: now + 1, last_seen_at: now + 1 });
  s.createDeviceToken({ device_token: "secret3", channel_id: "B", expires_at: now + 1e6, device_id: "d3", label: "Edge on Windows", created_at: now, last_seen_at: now });

  assert.equal(s.listDevices("A").length, 2, "channel A has two devices");
  assert.equal(s.listDevices("B").length, 1, "channel B has one");
  assert.ok(!JSON.stringify(s.listDevices("A")).includes("secret"), "no device token leaks in the list");

  assert.equal(s.revokeDeviceById("A", "d1"), true, "revoked d1");
  assert.deepEqual(s.listDevices("A").map((d) => d.device_id), ["d2"], "only d2 left on A");
  assert.equal(s.getDeviceToken("secret1"), null, "revoked token can no longer resume");
  assert.ok(s.getDeviceToken("secret2"), "the other device on A survives");

  assert.equal(s.revokeDeviceById("A", "d3"), false, "cannot revoke another channel's device");
  assert.ok(s.getDeviceToken("secret3"), "channel B's device untouched");
  assert.equal(s.revokeDeviceById("A", "nope"), false, "unknown device id is a no-op");
});

// ── Integration: pair two devices, list + revoke one over the wss, auth effect ─
let ctx: Awaited<ReturnType<typeof startServer>>;
test.before(async () => { ctx = await startServer(); });
after(async () => { if (ctx) await ctx.close(); });

function jar() {
  const cookies = new Map<string, string>();
  return {
    add(list: string[]) { for (const c of list) { const [f] = c.split(";"); const i = f!.indexOf("="); if (i < 0) continue; const k = f!.slice(0, i).trim(), v = f!.slice(i + 1).trim(); if (v) cookies.set(k, v); else cookies.delete(k); } },
    header() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); },
    only(name: string) { const v = cookies.get(name); return v ? `${name}=${v}` : ""; },
    get(name: string) { return cookies.get(name); }
  };
}
function setCookiesOf(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const s = res.headers.get("set-cookie"); return s ? [s] : [];
}
async function pairDevice(j: ReturnType<typeof jar>, issue: (code: string) => void, code: string): Promise<void> {
  const g = await fetch(`${ctx.baseUrl}/pair`); j.add(setCookiesOf(g)); await g.text();
  const csrf = j.get("ebh_pair_csrf")!;
  issue(code); await new Promise((r) => setTimeout(r, 60));
  const res = await fetch(`${ctx.baseUrl}/pair`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: j.header() }, body: new URLSearchParams({ csrf, code, remember: "1" }).toString(), redirect: "manual" });
  j.add(setCookiesOf(res));
  assert.equal(res.status, 303, "paired");
  assert.ok(j.get("ebh_device"), "remembered device cookie set");
}
async function waitFor(p: () => boolean, ms = 1500): Promise<void> {
  const s = Date.now(); while (!p()) { if (Date.now() - s > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); }
}

test("pair two devices → list over wss → revoke one → it stops resuming, the other survives", async () => {
  const frames: Array<Record<string, unknown>> = [];
  const agent = await spawnAgent(ctx.wsUrl, { agent_key: "ed25519:perdevice", handle: (f) => frames.push(f) });

  const phone = jar();
  const laptop = jar();
  await pairDevice(phone, (c) => agent.ws.send(JSON.stringify({ type: "pair_register", code: c, ttl_ms: 60_000, request_id: "p" })), "AAAA-AAAA");
  await pairDevice(laptop, (c) => agent.ws.send(JSON.stringify({ type: "pair_register", code: c, ttl_ms: 60_000, request_id: "l" })), "BBBB-BBBB");

  // Agent lists devices over the wss.
  agent.ws.send(JSON.stringify({ type: "sessions_list", request_id: "L" }));
  await waitFor(() => frames.some((f) => f.type === "sessions_list_ok"));
  const list = frames.find((f) => f.type === "sessions_list_ok") as { devices: Array<{ device_id: string; created_at: number }> };
  assert.equal(list.devices.length, 2, "both devices listed");

  // Newest-first: laptop paired second → index 0; phone → index 1. Revoke the phone.
  const phoneDeviceId = list.devices[1]!.device_id;
  agent.ws.send(JSON.stringify({ type: "session_revoke_one", request_id: "R", device_id: phoneDeviceId }));
  await waitFor(() => frames.some((f) => f.type === "session_revoke_one_ok"));
  const ack = frames.find((f) => f.type === "session_revoke_one_ok") as { revoked: boolean };
  assert.equal(ack.revoked, true, "host revoked the phone device");

  // Auth effect: with ONLY the device cookie (session gone), the revoked phone
  // no longer resumes (→ /pair); the laptop still resumes.
  const phoneResume = await fetch(`${ctx.baseUrl}/`, { headers: { cookie: phone.only("ebh_device") }, redirect: "manual" });
  assert.equal(phoneResume.status, 303, "revoked phone redirected to /pair (no resume)");
  const laptopResume = await fetch(`${ctx.baseUrl}/`, { headers: { cookie: laptop.only("ebh_device") }, redirect: "manual" });
  assert.notEqual(laptopResume.status, 303, "laptop still resumes from its device token");

  agent.close();
});
