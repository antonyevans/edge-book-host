import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
import { renderAddHtml } from "../src/reader-landing.js";
import { startServer } from "./helpers.js";

test("renderAddHtml: offers a one-tap 'Add to my agent' handoff gated on session", () => {
  const html = renderAddHtml();
  assert.match(html, /\/auth\/session/, "checks whether the visitor already has a session");
  assert.match(html, /\/\?add=/, "hands off to the authenticated reader with the invite");
  assert.match(html, /Add to my agent/, "shows the one-tap CTA");
});

test("renderReaderHtml: handles an ?add= invite by confirming and posting a friend request", () => {
  const html = renderReaderHtml({ csrf_token: "t", agent_online: true });
  assert.match(html, /location\.search/, "reads the add param from the URL");
  assert.match(html, /\/api\/friend\/request/, "posts the friend request to the agent API");
});

test("GET /auth/session reports unauthenticated for a cookieless request", async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(`${ctx.baseUrl}/auth/session`);
    assert.equal(res.status, 200);
    const body = await res.json() as { authenticated: boolean };
    assert.equal(body.authenticated, false);
  } finally {
    await ctx.close();
  }
});
