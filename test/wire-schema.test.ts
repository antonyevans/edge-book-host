// Wire-frame contract schema tests (ea-claude-152):
//   (a) generated embed (src/wire-schema.ts) ↔ JSON artifact sync
//   (b) validator unit cases (accept/reject per the schema subset)
//   (c) contract cases: frames shaped exactly as channels.ts emits them
//   (d) integration: an invalid mailbox_send over the real ws path is rejected
//       fail-closed with mailbox_send_err + frame_invalid counter
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WIRE_FRAMES_SCHEMA } from "../src/wire-schema.js";
import { validateWireFrame, gateInboundFrame } from "../src/frame-validate.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── (a) Embed ↔ JSON artifact sync ───────────────────────────────────────────
test("src/wire-schema.ts embeds exactly schemas/wire-frames.schema.json", () => {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "wire-frames.schema.json"), "utf8"));
  assert.deepEqual(WIRE_FRAMES_SCHEMA, json);
});

test("schema defines every wire frame plus the WireFrame union", () => {
  const defs = (WIRE_FRAMES_SCHEMA as { definitions: Record<string, unknown> }).definitions;
  for (const name of [
    "MailboxSendFrame", "MailboxSendOkFrame", "MailboxSendErrFrame", "MailboxDeliverFrame",
    "MailboxAckFrame", "MailboxStatusFrame", "MailboxStatusOkFrame", "MailboxStatusErrFrame",
    "MailboxStatusEntry", "HandleClaimFrame", "HandleClaimOkFrame", "HandleClaimErrFrame",
    "MailboxMessage", "WireFrame",
  ]) assert.ok(defs[name], `missing definition ${name}`);
});

test("schema never sets additionalProperties:false (forward compatibility)", () => {
  assert.ok(!JSON.stringify(WIRE_FRAMES_SCHEMA).includes('"additionalProperties":false'));
});

// ── (b) Validator unit cases ──────────────────────────────────────────────────
const VALID_FRAMES: Record<string, Record<string, unknown>> = {
  MailboxSendFrame: { type: "mailbox_send", request_id: "r1", to: "chanB", blob_b64: "aGk=" },
  MailboxSendOkFrame: { type: "mailbox_send_ok", request_id: "r1", id: "m1" },
  MailboxSendErrFrame: { type: "mailbox_send_err", request_id: "r1", error: "blob_too_large" },
  MailboxDeliverFrame: { type: "mailbox_deliver", id: "m1", from: "chanA", blob_b64: "aGk=", ts: 1 },
  MailboxAckFrame: { type: "mailbox_ack", id: "m1" },
  MailboxStatusFrame: { type: "mailbox_status", request_id: "r1", ids: ["m1", "m2"] },
  MailboxStatusOkFrame: { type: "mailbox_status_ok", request_id: "r1", statuses: [{ id: "m1", state: "queued", queued_ms: 5, recipient_live: false }] },
  MailboxStatusErrFrame: { type: "mailbox_status_err", request_id: "r1", error: "invalid_mailbox_status" },
  HandleClaimFrame: { type: "handle_claim", request_id: "r1", handle: "alice-smith", card: { agent_id: "did:openclaw:a" }, claimed_at: 1, claim_sig: "s" },
  HandleClaimOkFrame: { type: "handle_claim_ok", request_id: "r1", handle: "alice-smith" },
  HandleClaimErrFrame: { type: "handle_claim_err", request_id: "r1", reason: "taken" },
};

test("every valid frame is accepted (optional fields absent)", () => {
  for (const [def, frame] of Object.entries(VALID_FRAMES)) {
    assert.deepEqual(validateWireFrame(def, frame), { ok: true }, def);
    assert.deepEqual(validateWireFrame("WireFrame", frame), { ok: true }, `WireFrame anyOf: ${def}`);
  }
});

test("unknown extra fields pass (old/new client skew tolerated)", () => {
  const frame = { ...VALID_FRAMES.MailboxSendFrame, future_field: { nested: true }, v: 2 };
  assert.deepEqual(validateWireFrame("MailboxSendFrame", frame), { ok: true });
});

test("missing required property is rejected", () => {
  const r = validateWireFrame("MailboxSendFrame", { type: "mailbox_send", request_id: "r1", to: "chanB" });
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors.join(), /blob_b64/);
});

test("wrong property type is rejected", () => {
  const r = validateWireFrame("MailboxStatusFrame", { type: "mailbox_status", request_id: "r1", ids: [1, 2] });
  assert.equal(r.ok, false);
  const r2 = validateWireFrame("HandleClaimFrame", { ...VALID_FRAMES.HandleClaimFrame, claimed_at: "soon" });
  assert.equal(r2.ok, false);
});

test("bad const/enum is rejected", () => {
  assert.equal(validateWireFrame("MailboxAckFrame", { type: "mailbox_nack", id: "m1" }).ok, false);
  assert.equal(validateWireFrame("HandleClaimErrFrame", { type: "handle_claim_err", request_id: "r1", reason: "exploded" }).ok, false);
  assert.equal(validateWireFrame("MailboxStatusEntry", { id: "m1", state: "lost" }).ok, false);
});

test("error collection caps at 5", () => {
  const r = validateWireFrame("MailboxSendFrame", {});
  assert.equal(r.ok, false);
  assert.ok((r as { errors: string[] }).errors.length <= 5);
});

test("unknown definition name fails closed", () => {
  assert.equal(validateWireFrame("NoSuchFrame", {}).ok, false);
});

// ── (c) Contract cases: shapes exactly as channels.ts emits them ─────────────
test("mailbox_send_ok with recipient_live (channels.ts emit shape) validates", () => {
  const frame = { type: "mailbox_send_ok", request_id: "r1", id: "m1", recipient_live: true };
  assert.deepEqual(validateWireFrame("MailboxSendOkFrame", frame), { ok: true });
});

test("mailbox_deliver with and without trace_id validates", () => {
  const base = { type: "mailbox_deliver", id: "m1", from: "chanA", blob_b64: "aGk=", ts: Date.now() };
  assert.deepEqual(validateWireFrame("MailboxDeliverFrame", base), { ok: true });
  assert.deepEqual(validateWireFrame("MailboxDeliverFrame", { ...base, trace_id: "t-1" }), { ok: true });
});

test("mailbox_status_ok with omitted optional entry fields validates (acked/unknown)", () => {
  const frame = {
    type: "mailbox_status_ok", request_id: "r1",
    statuses: [
      { id: "a", state: "queued", queued_ms: 12, recipient_live: false },
      { id: "b", state: "delivered", queued_ms: 0, recipient_live: true },
      { id: "c", state: "acked" },
      { id: "d", state: "unknown" },
    ],
  };
  assert.deepEqual(validateWireFrame("MailboxStatusOkFrame", frame), { ok: true });
});

test("gateInboundFrame: covered types gate, uncovered pass, replies match protocol", () => {
  assert.deepEqual(gateInboundFrame(VALID_FRAMES.MailboxSendFrame!), { ok: true });
  assert.deepEqual(gateInboundFrame({ type: "pong" }), { ok: true }); // uncovered → pass
  const send = gateInboundFrame({ type: "mailbox_send", request_id: "r9" });
  assert.equal(send.ok, false);
  assert.deepEqual((send as { reply: unknown }).reply, { type: "mailbox_send_err", request_id: "r9", error: "invalid_mailbox_send" });
  const status = gateInboundFrame({ type: "mailbox_status", request_id: "r9", ids: "m1" });
  assert.equal(status.ok, false);
  assert.deepEqual((status as { reply: unknown }).reply, { type: "mailbox_status_err", request_id: "r9", error: "invalid_mailbox_status" });
  const claim = gateInboundFrame({ type: "handle_claim", request_id: "r9" });
  assert.equal(claim.ok, false);
  assert.deepEqual((claim as { reply: unknown }).reply, { type: "handle_claim_err", request_id: "r9", reason: "bad_format" });
  const ack = gateInboundFrame({ type: "mailbox_ack" }); // missing id → silent drop
  assert.equal(ack.ok, false);
  assert.equal((ack as { reply: unknown }).reply, null);
});

// ── (d) Integration: invalid mailbox_send over the real ws path ─────────────
import { startServer, spawnAgent, channels } from "./helpers.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
after(async () => { if (serverCtx) await serverCtx.close(); });

test("invalid mailbox_send over ws gets mailbox_send_err and bumps frames_invalid", async () => {
  serverCtx = await startServer();
  const before = channels.metrics().frames_invalid;

  const replies: Record<string, unknown>[] = [];
  const agent = await spawnAgent(serverCtx.wsUrl, { handle: (frame) => { replies.push(frame); } });
  // blob_b64 is a number — the loose handler would have coerced it; the
  // contract gate rejects it fail-closed before any handler logic runs.
  agent.ws.send(JSON.stringify({ type: "mailbox_send", request_id: "bad-1", to: "chanB", blob_b64: 42 }));

  const deadline = Date.now() + 2000;
  while (!replies.some((f) => f.type === "mailbox_send_err") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const err = replies.find((f) => f.type === "mailbox_send_err");
  assert.ok(err, "got mailbox_send_err");
  assert.equal(err!.request_id, "bad-1");
  assert.equal(err!.error, "invalid_mailbox_send");
  assert.equal(channels.metrics().frames_invalid, before + 1, "frame_invalid counter incremented");

  // A well-formed send on the same socket still works (channel survives).
  agent.ws.send(JSON.stringify({ type: "mailbox_send", request_id: "ok-1", to: "chanB", blob_b64: Buffer.from("hi").toString("base64") }));
  while (!replies.some((f) => f.type === "mailbox_send_ok") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(replies.some((f) => f.type === "mailbox_send_ok" && f.request_id === "ok-1"), "valid send still accepted");
  agent.close();
});
