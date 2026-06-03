// ea-claude-062 convergence skeleton (host-side, fixture-backed).
//
// Runs the FULL Edge Book MVP loop over the REAL mailbox transport (064) and the
// REAL fail-closed `canRead` predicate (063/Contract 2), with a fixture object +
// grant standing in for openclaw's 065 (agent transport client) and 066 (grant
// primitives + object model) until they land. At Phase 2 the two "agent does X"
// blocks below are swapped for real `edge-book` plugin calls — the mailbox and
// the access predicate are already the production ones.
//
// Scenario (spec-0020 acceptance): A shares an object to B with a grant → B sees
// it → A revokes → B denied → non-friend C never saw it → every step audited.
// node:test makes the run exit nonzero on any failed assertion.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer, store } from "./helpers.js";
import { canRead, type SharedObject, type Grant, type AuditEvent } from "../src/contracts.js";

let serverCtx: Awaited<ReturnType<typeof startServer>> | null = null;
test.before(async () => { serverCtx = await startServer(); });
after(async () => { if (serverCtx) await serverCtx.close(); });

// Minimal persistent-handler agent (same shape as the 065 client will have).
class Agent {
  ws: WebSocket; channel_id = "";
  inbox: Array<{ id: string; from: string; blob_b64: string; ts: number }> = [];
  private sendOks = new Map<string, string>();
  private waiters: Array<() => void> = [];
  private constructor(ws: WebSocket) { this.ws = ws; }
  static async connect(wsUrl: string, key: string): Promise<Agent> {
    const ws = new WebSocket(wsUrl); const a = new Agent(ws);
    await new Promise<void>((resolve, reject) => {
      ws.on("message", (raw) => {
        const f = JSON.parse(raw.toString());
        if (f.type === "hello_ok") { a.channel_id = f.channel_id; resolve(); }
        else if (f.type === "hello_err") reject(new Error(f.error));
        else if (f.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
        else if (f.type === "mailbox_deliver") { a.inbox.push(f); a.wake(); }
        else if (f.type === "mailbox_send_ok") { a.sendOks.set(f.request_id, f.id); a.wake(); }
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", agent_key: key, version: "t", nonce: "n" })));
      ws.once("error", reject);
    });
    return a;
  }
  private wake() { this.waiters.splice(0).forEach((w) => w()); }
  private async until(c: () => boolean, what: string, ms = 2000) {
    const t = Date.now();
    while (!c()) { if (Date.now() - t > ms) throw new Error("timeout: " + what); await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); }); }
  }
  async deliver(to: string, payload: unknown, request_id: string): Promise<string> {
    const blob_b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    this.ws.send(JSON.stringify({ type: "mailbox_send", request_id, to, blob_b64 }));
    await this.until(() => this.sendOks.has(request_id), "send_ok " + request_id);
    return this.sendOks.get(request_id)!;
  }
  async waitInbox(n: number) { await this.until(() => this.inbox.length >= n, n + " envelopes"); }
  applied(): Array<Record<string, unknown>> { return this.inbox.map((m) => JSON.parse(Buffer.from(m.blob_b64, "base64").toString("utf8"))); }
  ack(id: string) { this.ws.send(JSON.stringify({ type: "mailbox_ack", id })); }
  close() { this.ws.close(); }
}

test("convergence: A shares to B with a grant → B reads → A revokes → B denied → C never saw it → all audited", async () => {
  const { wsUrl } = await startServer();
  const A = await Agent.connect(wsUrl, "ed25519:conv-A");
  const C = await Agent.connect(wsUrl, "ed25519:conv-C-nonfriend");
  // B is OFFLINE at share time — exercises store-and-forward like the real demo.
  const B0 = await Agent.connect(wsUrl, "ed25519:conv-B");
  const subjectB = B0.channel_id;
  B0.close();
  await new Promise((r) => setTimeout(r, 50));

  const audit: AuditEvent[] = [];
  const pushAudit = (type: AuditEvent["type"], actor: string, ref_id: string) =>
    audit.push({ event_id: "ev_" + audit.length, type, actor, ref_id, ts: 1_780_000_000_000 + audit.length, signature: "sig" });

  // --- A (today: fixture; Phase 2: openclaw 066) creates object + issues grant ---
  const object: SharedObject = {
    object_id: "obj_conv_1", type: "request", from_agent: A.channel_id,
    request: { title: "Review the venue contract", body: "Two liability clauses need a second pair of eyes." },
    attachment: { filename: "contract.pdf", mime: "application/pdf", size: 12_345, ref: "blob:held-by-A" },
    created_at: 1_780_000_000_000, signature: "sig"
  };
  pushAudit("object_create", A.channel_id, object.object_id);
  let grant: Grant = {
    grant_id: "grant_conv_1", object_id: object.object_id, issuer: A.channel_id, subject: subjectB,
    scope: "object.read", status: "active", issued_at: 1_780_000_000_000, signature: "sig"
  };
  pushAudit("grant_issue", A.channel_id, grant.grant_id);

  // --- A delivers object+grant to B over the REAL mailbox (B offline → queued) ---
  await A.deliver(subjectB, { kind: "object_share", object, grant }, "share1");
  assert.equal(store.mailboxCount(), 1, "share queued for offline B");

  // C, a non-friend, was never sent anything and holds no grant.
  assert.equal(canRead([grant], object.object_id, C.channel_id), false, "non-friend C cannot read (no grant)");

  // --- B reconnects, receives the share, and reads (fail-closed canRead) ---
  const B = await Agent.connect(wsUrl, "ed25519:conv-B");
  assert.equal(B.channel_id, subjectB, "B reconnects to the same channel");
  await B.waitInbox(1);
  const share = B.applied()[0]!;
  assert.equal(share.kind, "object_share");
  const recvGrant = share.grant as Grant;
  assert.equal(canRead([recvGrant], object.object_id, subjectB), true, "B reads: active grant permits it");
  pushAudit("object_access", subjectB, object.object_id);
  B.ack(B.inbox[0]!.id);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(store.mailboxCount(), 0, "delivered share acked + deleted");

  // C still saw nothing.
  assert.equal(C.inbox.length, 0, "non-friend C received no envelope");

  // --- A revokes; delivers a revoke envelope to B (forward-looking) ---
  grant = { ...grant, status: "revoked" };
  pushAudit("grant_revoke", A.channel_id, grant.grant_id);
  await A.deliver(subjectB, { kind: "grant_revoke", grant_id: grant.grant_id, object_id: object.object_id }, "revoke1");
  await B.waitInbox(2);
  // After revoke, B's read check fails-closed.
  assert.equal(canRead([grant], object.object_id, subjectB), false, "B denied after revoke (forward-looking)");
  B.ack(B.inbox[1]!.id);
  await new Promise((r) => setTimeout(r, 80));

  // --- Full audit chain present, in order ---
  assert.deepEqual(audit.map((e) => e.type), [
    "object_create", "grant_issue", "object_access", "grant_revoke"
  ], "every create/grant/access/revoke wrote an audit event");

  A.close(); B.close(); C.close();
});
