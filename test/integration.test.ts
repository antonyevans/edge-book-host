import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, spawnAgent } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof startServer>>;
test.before(async () => { ctx = await startServer(); });

// Cookie jar helper — fetch in Node doesn't manage cookies.
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
        if (value === "") cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header(): string {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    get(name: string): string | undefined { return cookies.get(name); }
  };
}
function setCookiesOf(res: Response): string[] {
  // Node's fetch exposes per-header values via getSetCookie() (RFC 6265bis).
  const headers = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

async function pair(channel_id: string, jarObj: ReturnType<typeof jar>, agentCodeIssuer: (code: string) => void): Promise<void> {
  // 1) GET /pair to pick up pair CSRF cookie.
  const getRes = await fetch(`${ctx.baseUrl}/pair`);
  jarObj.add(setCookiesOf(getRes));
  await getRes.text();
  const pairCsrf = jarObj.get("ebh_pair_csrf")!;
  assert.ok(pairCsrf, "pair CSRF cookie set");

  // 2) Agent registers a code; wait for the wss frame to be processed.
  const code = "TEST-CODE";
  agentCodeIssuer(code);
  await new Promise((r) => setTimeout(r, 60));

  // 3) Submit code.
  const form = new URLSearchParams({ csrf: pairCsrf, code, remember: "1" });
  const postRes = await fetch(`${ctx.baseUrl}/pair`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jarObj.header() },
    body: form.toString(),
    redirect: "manual"
  });
  jarObj.add(setCookiesOf(postRes));
  assert.equal(postRes.status, 303);
  assert.ok(jarObj.get("ebh_session"), "session cookie set");
  assert.ok(jarObj.get("ebh_device"), "device cookie set");
}

test("end-to-end: pair, hit /api/feed, agent answers via wss", async () => {
  let agentChannelId = "";
  // The agent in this test answers /api/feed with a canned JSON body.
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type === "api_request") {
        send({
          type: "api_response",
          request_id: frame.request_id,
          status: 200,
          headers: { "content-type": "application/json" },
          body_b64: Buffer.from(JSON.stringify({ feed_items: { f1: { feed_item_id: "f1", post_id: "p1" } } })).toString("base64")
        });
      }
    }
  });
  agentChannelId = agent.channel_id;

  const jarObj = jar();
  await pair(agentChannelId, jarObj, (code) => {
    agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r1" }));
  });
  // Wait briefly for pair_register_ok roundtrip.
  await new Promise((r) => setTimeout(r, 50));

  // Now hit /api/feed.
  const r = await fetch(`${ctx.baseUrl}/api/feed`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.feed_items?.f1);
  agent.close();
});

test("agent offline: /api/feed returns 502 once the wss is closed", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type === "api_request") {
        send({ type: "api_response", request_id: frame.request_id, status: 200, headers: {}, body_b64: Buffer.from("{}").toString("base64") });
      }
    }
  });
  const jarObj = jar();
  await pair(agent.channel_id, jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));

  agent.ws.close();
  await new Promise((r) => setTimeout(r, 50));

  const r = await fetch(`${ctx.baseUrl}/api/feed`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 502);
});

test("CSRF: mutations without x-csrf-token are rejected (403)", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type === "api_request") {
        send({ type: "api_response", request_id: frame.request_id, status: 200, headers: {}, body_b64: Buffer.from("{}").toString("base64") });
      }
    }
  });
  const jarObj = jar();
  await pair(agent.channel_id, jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));

  // No CSRF header.
  const r = await fetch(`${ctx.baseUrl}/api/posts`, {
    method: "POST",
    headers: { cookie: jarObj.header(), "content-type": "application/json" },
    body: JSON.stringify({ title: "x", body: "y" })
  });
  assert.equal(r.status, 403);
  agent.close();
});

test("isolation: a session bound to agent A cannot reach agent B's data", async () => {
  // Two agents, two pairings, each gets its own session.
  const a = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type === "api_request") {
        send({ type: "api_response", request_id: frame.request_id, status: 200, headers: { "content-type": "application/json" }, body_b64: Buffer.from(JSON.stringify({ who: "A" })).toString("base64") });
      }
    }
  });
  const b = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type === "api_request") {
        send({ type: "api_response", request_id: frame.request_id, status: 200, headers: { "content-type": "application/json" }, body_b64: Buffer.from(JSON.stringify({ who: "B" })).toString("base64") });
      }
    }
  });
  assert.notEqual(a.channel_id, b.channel_id, "channels distinct");

  const jarA = jar();
  await pair(a.channel_id, jarA, (code) => a.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "ra" })));
  const jarB = jar();
  await pair(b.channel_id, jarB, (code) => b.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "rb" })));
  await new Promise((r) => setTimeout(r, 50));

  const rA = await (await fetch(`${ctx.baseUrl}/api/me`, { headers: { cookie: jarA.header() } })).json();
  const rB = await (await fetch(`${ctx.baseUrl}/api/me`, { headers: { cookie: jarB.header() } })).json();
  assert.equal(rA.who, "A");
  assert.equal(rB.who, "B");

  a.close();
  b.close();
});

test("redaction: host strips a leaked private key from an /api/* response (ea-claude-050)", async () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBg\n-----END PRIVATE KEY-----";
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type !== "api_request") return;
      // A buggy agent leaks both a secret-named field and a raw PEM block.
      send({
        type: "api_response",
        request_id: frame.request_id,
        status: 200,
        headers: { "content-type": "application/json" },
        body_b64: Buffer.from(JSON.stringify({
          identity: {
            did: "did:openclaw:abc",
            handle: "leaky.local",
            public_key: "ed25519:pub",
            private_key_pem: pem,
            nested: { secret: "shhh", api_secret_key: "x" }
          }
        })).toString("base64")
      });
    }
  });
  const jarObj = jar();
  await pair(agent.channel_id, jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));

  const res = await fetch(`${ctx.baseUrl}/api/me`, { headers: { cookie: jarObj.header() } });
  const raw = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!/private[_-]?key/i.test(raw), "no private_key field survives");
  assert.ok(!raw.includes("PRIVATE KEY"), "no PEM private block survives");
  assert.ok(!raw.includes("shhh"), "secret-named field stripped");
  const body = JSON.parse(raw);
  assert.equal(body.identity.did, "did:openclaw:abc", "public fields preserved");
  assert.equal(body.identity.public_key, "ed25519:pub", "public key preserved");
  agent.close();
});

test("multi-connection: a transient second socket on the same key does not orphan the channel (ea-claude-055)", async () => {
  const key = "ed25519:shared-key-055";
  const answer = (who: string) => (frame: Record<string, unknown>, send: (f: Record<string, unknown>) => void) => {
    if (frame.type === "api_request") {
      send({ type: "api_response", request_id: frame.request_id, status: 200, headers: { "content-type": "application/json" }, body_b64: Buffer.from(JSON.stringify({ who })).toString("base64") });
    }
  };
  // Persistent dial-out holds the channel.
  const primary = await spawnAgent(ctx.wsUrl, { agent_key: key, handle: answer("primary") });
  const jarObj = jar();
  await pair(primary.channel_id, jarObj, (code) => primary.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));
  let r = await fetch(`${ctx.baseUrl}/api/feed`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 200, "channel serves before the second socket");

  // A short-lived second socket on the SAME key (simulates `edge-book pair` minting a code).
  const second = await spawnAgent(ctx.wsUrl, { agent_key: key, handle: answer("second") });
  assert.equal(second.channel_id, primary.channel_id, "same key -> same channel");
  await new Promise((r) => setTimeout(r, 30));
  // It leaves.
  second.ws.close();
  await new Promise((r) => setTimeout(r, 100));

  // The channel must survive on the persistent dial-out — no orphan, no 502.
  r = await fetch(`${ctx.baseUrl}/api/feed`, { headers: { cookie: jarObj.header() } });
  assert.equal(r.status, 200, "channel survived the transient socket leaving");
  const body = await r.json();
  assert.equal(body.who, "primary", "fell back to the persistent dial-out");
  primary.close();
});

test("request-ID correlation: 20 concurrent calls return matched bodies under randomized agent latency", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type !== "api_request") return;
      // Echo the path as the body; randomize response order to stress correlation.
      const path = String(frame.path || "");
      const delay = Math.floor(Math.random() * 25);
      setTimeout(() => {
        send({
          type: "api_response",
          request_id: frame.request_id,
          status: 200,
          headers: { "content-type": "application/json" },
          body_b64: Buffer.from(JSON.stringify({ echo: path })).toString("base64")
        });
      }, delay);
    }
  });
  const jarObj = jar();
  await pair(agent.channel_id, jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));

  const N = 20;
  const expected = Array.from({ length: N }, (_, i) => `/api/probe-${i}`);
  const responses = await Promise.all(expected.map(async (p) => {
    const r = await fetch(`${ctx.baseUrl}${p}`, { headers: { cookie: jarObj.header() } });
    return (await r.json()).echo as string;
  }));
  assert.deepEqual(responses, expected, "each browser request received its own agent response");
  agent.close();
});

test("stalled agent does not block other concurrent requests", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame, send) => {
      if (frame.type !== "api_request") return;
      const path = String(frame.path || "");
      if (path === "/api/stall") return; // never answers
      send({
        type: "api_response",
        request_id: frame.request_id,
        status: 200,
        headers: { "content-type": "application/json" },
        body_b64: Buffer.from(JSON.stringify({ ok: true })).toString("base64")
      });
    }
  });
  const jarObj = jar();
  await pair(agent.channel_id, jarObj, (code) => agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r" })));
  await new Promise((r) => setTimeout(r, 50));

  // Fire stalled request with an AbortController so the test can finish without
  // waiting for the proxy's 30s timeout.
  const ac = new AbortController();
  const stalled = fetch(`${ctx.baseUrl}/api/stall`, { headers: { cookie: jarObj.header() }, signal: ac.signal });
  const fast = fetch(`${ctx.baseUrl}/api/fast`, { headers: { cookie: jarObj.header() } });
  const fastRes = await fast;
  assert.equal(fastRes.status, 200, "concurrent request unaffected by stall");
  ac.abort();
  await stalled.catch(() => {});
  agent.close();
});

after(async () => { if (ctx) await ctx.close(); });
