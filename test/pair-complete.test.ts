import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, spawnAgent } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof startServer>>;
test.before(async () => { ctx = await startServer(); });
after(async () => { if (ctx) await ctx.close(); });

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
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const s = res.headers.get("set-cookie");
  return s ? [s] : [];
}

async function redeemCode(code: string, jarObj: ReturnType<typeof jar>): Promise<Response> {
  const get = await fetch(`${ctx.baseUrl}/pair`);
  jarObj.add(setCookiesOf(get));
  await get.text();
  const csrf = jarObj.get("ebh_pair_csrf")!;
  const post = await fetch(`${ctx.baseUrl}/pair`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jarObj.header() },
    body: new URLSearchParams({ csrf, code }).toString(),
    redirect: "manual",
  });
  jarObj.add(setCookiesOf(post));
  return post;
}

test("pair_complete is pushed to agent on code redemption", async () => {
  const received: Array<Record<string, unknown>> = [];
  const agent = await spawnAgent(ctx.wsUrl, {
    handle: (frame) => { received.push(frame as Record<string, unknown>); }
  });

  const code = "PCAA-0001";
  agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r1" }));
  await new Promise(r => setTimeout(r, 60));

  const post = await redeemCode(code, jar());
  assert.equal(post.status, 303, "pair page should redirect on success");

  const deadline = Date.now() + 2000;
  while (!received.some(f => f.type === "pair_complete") && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 20));
  }
  const pc = received.find(f => f.type === "pair_complete");
  assert.ok(pc, "pair_complete frame received by agent");
  assert.equal(typeof pc.device_id, "string", "device_id is a string");
  assert.equal(typeof pc.label, "string", "label is a string");

  agent.close();
});

test("pair_complete drops silently when agent has no live channel at redemption time", async () => {
  const agent = await spawnAgent(ctx.wsUrl, {});
  const code = "PCBB-0002";
  agent.ws.send(JSON.stringify({ type: "pair_register", code, ttl_ms: 60_000, request_id: "r2" }));
  await new Promise(r => setTimeout(r, 60));
  agent.close();
  await new Promise(r => setTimeout(r, 80));

  const post = await redeemCode(code, jar());
  assert.equal(post.status, 303, "pairing still succeeds even when agent offline");
});
