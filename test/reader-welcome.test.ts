import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";

const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

// Slice from the start of renderWelcome to the next function declaration, so
// the window tracks the actual function body without bleeding into neighbors.
function renderWelcomeBody(): string {
  const start = html.indexOf("function renderWelcome");
  assert.notEqual(start, -1, "renderWelcome not found in reader html");
  const next = html.indexOf("function ", start + "function renderWelcome".length);
  return next === -1 ? html.slice(start) : html.slice(start, next);
}

test("feed fallback routes empty room to renderWelcome, else renderFeedEmpty", () => {
  assert.match(html, /isEmptyRoom\(\) \? renderWelcome\(state\.invite\) : renderFeedEmpty\(\)/);
});

test("isEmptyRoom tests the three real state keys with shape-correct predicates", () => {
  assert.match(html, /function isEmptyRoom/);
  assert.match(html, /values\(state\.contacts\)\.length === 0/);
  assert.match(html, /values\(state\.feedItems\)\.length === 0/);
  assert.match(html, /\(state\.shared \|\| \[\]\)\.length === 0/);
});

test("welcome copy: headline + mental-model sentence, exactly once", () => {
  assert.equal((html.match(/Your room\./g) || []).length, 1);
  assert.equal(
    (html.match(/Friends&#39; shares appear here\. You decide who comes in, what they can see, and you can take anything back\./g) || []).length,
    1
  );
});

test("welcome card has its own QR element id and a Show my card button", () => {
  assert.match(html, /id="welcomeQr"/);
  assert.match(html, /id="inviteQr"/); // the Add-me view keeps its own
  assert.match(html, /data-view-target="add">Show my card<\/button>/);
});

test("renderWelcome takes invite as arg and degrades without it", () => {
  assert.match(html, /function renderWelcome\(invite\)/);
  const fn = renderWelcomeBody();
  assert.match(fn, /if \(link\)/);
  assert.match(fn, /Send this link to a friend/);
});

test("welcome QR population reuses one helper for both views", () => {
  assert.match(html, /function populateInviteQr\(elementId\)/);
  assert.match(html, /populateInviteQr\("inviteQr"\)/);
  assert.match(html, /populateInviteQr\("welcomeQr"\)/);
});

test("welcome copy contains no banned vocabulary", () => {
  const fn = renderWelcomeBody();
  for (const word of ["Hermes", "mailbox", "envelope", "relay", "DID"]) {
    assert.ok(!fn.includes(word), `banned word in welcome copy: ${word}`);
  }
});
