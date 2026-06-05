import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof startServer>>;
test.before(async () => { ctx = await startServer(); });
after(async () => { if (ctx) await ctx.close(); });

function setCookiesOf(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const s = res.headers.get("set-cookie");
  return s ? [s] : [];
}
function pairCsrfCookie(res: Response): string | undefined {
  for (const c of setCookiesOf(res)) {
    const m = /^ebh_pair_csrf=([^;]*)/.exec(c);
    if (m) return m[1];
  }
  return undefined;
}
function formCsrf(html: string): string | undefined {
  const m = /name="csrf"\s+value="([^"]*)"/.exec(html);
  return m ? m[1] : undefined;
}

// ea-claude-054: every /pair error re-render (403, 400, 429) must carry a CSRF
// token that matches the ebh_pair_csrf cookie, so the form is usable without a
// manual reload. The 429 path was the worst (empty token).

test("403 (mismatched CSRF) re-renders a usable token + cookie", async () => {
  const res = await fetch(`${ctx.baseUrl}/pair`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: "wrong", code: "TEST-CODE" }).toString()
  });
  assert.equal(res.status, 403);
  const html = await res.text();
  const token = formCsrf(html);
  assert.ok(token && token.length > 0, "403 form has a non-empty CSRF token");
  assert.equal(pairCsrfCookie(res), token, "403 sets a matching ebh_pair_csrf cookie");
  assert.doesNotMatch(html, /Reload and try again/, "no longer tells the user to reload");
});

test("400 (bad code) and the 429 lockout both re-render a usable token + cookie", async () => {
  // Get an initial token + cookie.
  const get = await fetch(`${ctx.baseUrl}/pair`);
  const csrf0 = pairCsrfCookie(get)!;
  await get.text();
  assert.ok(csrf0, "GET /pair sets a pair csrf cookie");
  const cookie = `ebh_pair_csrf=${csrf0}`;

  // Drive bad-code POSTs (valid CSRF) until the limiter locks (10 failures → 429).
  let saw400 = false;
  let lockedHtml = "";
  let lockedRes: Response | null = null;
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${ctx.baseUrl}/pair`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ csrf: csrf0, code: "ZZZZ-ZZZZ" }).toString()
    });
    const html = await res.text();
    if (res.status === 400) { saw400 = true; assert.equal(formCsrf(html), csrf0, "400 echoes the valid token"); }
    if (res.status === 429) { lockedRes = res; lockedHtml = html; break; }
  }
  assert.ok(saw400, "bad codes returned 400 before lockout");
  assert.ok(lockedRes, "the limiter eventually returned 429");

  // The 429 page must still carry a usable token (was empty before the fix).
  const token = formCsrf(lockedHtml);
  assert.ok(token && token.length > 0, "429 form has a non-empty CSRF token");
  // Token matches either a freshly-set cookie or the existing one.
  const setCookie = pairCsrfCookie(lockedRes!);
  assert.equal(token, setCookie ?? csrf0, "429 token matches the pair csrf cookie");
});
