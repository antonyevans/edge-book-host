import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAddHtml, renderReaderHtml } from "../src/reader-html.js";
import { startServer } from "./helpers.js";

function scriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) bodies.push(m[1]!);
  return bodies;
}

test("renderAddHtml: page reads the invite from the URL fragment and builds a friend-request command", () => {
  const html = renderAddHtml();
  assert.match(html, /location\.hash/, "reads the fragment client-side");
  assert.match(html, /friend request/, "shows the agent CLI command to import the invite");
  // Every inline script must be syntactically valid (same gate as the reader).
  scriptBodies(html).forEach((body, i) => {
    assert.doesNotThrow(() => new Function(body), `inline <script> #${i + 1} in renderAddHtml has a JS syntax error`);
  });
});

test("reader invite QR now encodes the https /add deep-link, not the bare edgebook: scheme", () => {
  const html = renderReaderHtml({ csrf_token: "t", agent_online: true });
  assert.match(html, /\/add#i=/, "invite link/QR points at the camera-openable /add page");
});

test("GET /add serves a 200 HTML page (no session required)", async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(`${ctx.baseUrl}/add`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    const body = await res.text();
    assert.match(body, /Add/);
  } finally {
    await ctx.close();
  }
});
