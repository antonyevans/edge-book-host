import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, spawnAgent } from "./helpers.js";
import { renderReaderHtml } from "../src/reader-html.js";
import type { SharedObject } from "../src/contracts.js";

let ctx: Awaited<ReturnType<typeof startServer>>;
test.before(async () => { ctx = await startServer(); });
after(async () => { if (ctx) await ctx.close(); });

// ── Cookie jar + pair helpers (mirrors integration.test.ts) ──────────────────
function jar() {
  const cookies = new Map<string, string>();
  return {
    add(setCookies: string[]) {
      for (const part of setCookies) {
        const [first] = part.split(";");
        const eq = first!.indexOf("=");
        if (eq === -1) continue;
        const name = first!.slice(0, eq).trim();
        const value = first!.slice(eq + 1).trim();
        if (value === "") cookies.delete(name); else cookies.set(name, value);
      }
    },
    header(): string { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); },
    get(name: string): string | undefined { return cookies.get(name); }
  };
}
function setCookiesOf(res: Response): string[] {
  const headers = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}
async function pair(jarObj: ReturnType<typeof jar>, issue: (code: string) => void): Promise<void> {
  const getRes = await fetch(`${ctx.baseUrl}/pair`);
  jarObj.add(setCookiesOf(getRes));
  await getRes.text();
  const pairCsrf = jarObj.get("ebh_pair_csrf")!;
  const code = "TEST-CODE";
  issue(code);
  await new Promise((r) => setTimeout(r, 60));
  const form = new URLSearchParams({ csrf: pairCsrf, code, remember: "1" });
  const postRes = await fetch(`${ctx.baseUrl}/pair`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jarObj.header() },
    body: form.toString(),
    redirect: "manual"
  });
  jarObj.add(setCookiesOf(postRes));
  assert.equal(postRes.status, 303, "pairing established a session");
}

const FIXTURE: SharedObject = {
  object_id: "obj_001",
  type: "request",
  from_agent: "did:openclaw:alice",
  request: { title: "Could you review the venue contract?", body: "Two clauses on liability need a second pair of eyes before Friday." },
  attachment: { filename: "venue-contract.pdf", mime: "application/pdf", size: 348_201, ref: "blob:agent-held-ref-xyz" },
  created_at: 1_780_000_000_000,
  signature: "ed25519:fixture-sig"
};

// ── The reader template wires the new Contract-2 surfaces ────────────────────
test("reader HTML exposes the Shared-with-me and Add-me surfaces", () => {
  const html = renderReaderHtml({ csrf_token: "csrf123", agent_online: true });
  assert.match(html, /data-view="shared"/, "shared nav button present");
  assert.match(html, /Shared with me/, "shared view label present");
  assert.match(html, /data-view="add"/, "add-me nav button present");
  // Shared view fetches the grant-gated object surface and the invite endpoint.
  assert.match(html, /\/api\/shared-objects/, "reader fetches the shared-objects surface");
  assert.match(html, /\/api\/invite/, "reader fetches the invite surface");
  // Pairing surface renders a copyable invite link with honest privacy framing.
  assert.match(html, /copy-invite/, "invite copy action wired");
  assert.match(html, /no end-to-end encryption claim/i, "honest privacy posture shown");
});

// ── ea-claude-051 regression: mutations re-fetch + re-render ──────────────────
// After a successful create/action the reader must re-fetch so the new post (and
// the summary counters, derived from the same state.posts) appear without a
// manual reload. Verified live in a browser; this guards the wiring from removal.
test("reader re-renders after a mutation (createPost + runAction call refresh)", () => {
  const html = renderReaderHtml({ csrf_token: "csrf123", agent_online: true });
  // Body of a named function = from its declaration up to the next "function " decl.
  function body(name: string): string {
    const start = html.indexOf(name);
    assert.ok(start >= 0, `${name} present`);
    const after = html.indexOf("function ", start + name.length);
    return html.slice(start, after === -1 ? undefined : after);
  }
  assert.match(body("async function createPost"), /await refresh\(\)/, "createPost re-fetches after POST /api/posts");
  assert.match(body("async function runAction"), /await refresh\(\)/, "runAction re-fetches after a mutation");
  // Summary draft counter is derived from the same fetched state, not a separate source.
  assert.match(html, /setText\("summaryDrafts", draftPosts\(\)\.length\)/, "summary counter derives from state.posts");
});

// ── Granted recipient: the shared object reaches the reader via the proxy ─────
test("a granted reader receives the shared object through the host proxy", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type !== "api_request") return;
      // The agent (066) is the authority: it returns the object only because an
      // active object.read grant exists for this owner (fail-closed canRead).
      const path = String(frame.path || "");
      const body = path === "/api/shared-objects"
        ? { objects: [{ ...FIXTURE, grant_scope: "object.read" }] }
        : { ok: true };
      send({
        type: "api_response", request_id: frame.request_id, status: 200,
        headers: { "content-type": "application/json" },
        body_b64: Buffer.from(JSON.stringify(body)).toString("base64")
      });
    }
  });
  const jarObj = jar();
  await pair(jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "p1" })));
  await new Promise((r) => setTimeout(r, 50));

  const r = await fetch(`${ctx.baseUrl}/api/shared-objects`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.objects.length, 1, "granted object is present");
  const obj = body.objects[0];
  assert.equal(obj.object_id, "obj_001");
  assert.equal(obj.type, "request");
  assert.equal(obj.request.title, FIXTURE.request.title);
  assert.equal(obj.attachment.filename, "venue-contract.pdf");
  // R4 conformance: the object carries NO delivery/verification/status field.
  for (const banned of ["status", "state", "delivered", "verified", "paid", "completion"]) {
    assert.ok(!(banned in obj), `object must not carry a '${banned}' field (spec-0020 R4)`);
  }
  agent.close();
});

// ── Non-granted reader: the object is simply absent (fail-closed) ────────────
test("a non-granted reader sees no shared object", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type !== "api_request") return;
      // No active grant for this owner → the agent returns an empty set. The
      // host renders nothing; nothing is shared by default (spec-0020 R3).
      send({
        type: "api_response", request_id: frame.request_id, status: 200,
        headers: { "content-type": "application/json" },
        body_b64: Buffer.from(JSON.stringify({ objects: [] })).toString("base64")
      });
    }
  });
  const jarObj = jar();
  await pair(jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "p2" })));
  await new Promise((r) => setTimeout(r, 50));

  const r = await fetch(`${ctx.baseUrl}/api/shared-objects`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.objects.length, 0, "no object visible without a grant");
  agent.close();
});
