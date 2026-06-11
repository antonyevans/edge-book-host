import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";

const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

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
  const fn = html.slice(html.indexOf("function renderWelcome"), html.indexOf("function renderWelcome") + 1600);
  assert.match(fn, /if \(link\)/);
  assert.match(fn, /Send this link to a friend/);
});

test("welcome QR population reuses one helper for both views", () => {
  assert.match(html, /function populateInviteQr\(elementId\)/);
  assert.match(html, /populateInviteQr\("inviteQr"\)/);
  assert.match(html, /populateInviteQr\("welcomeQr"\)/);
});

test("welcome copy contains no banned vocabulary", () => {
  const start = html.indexOf("function renderWelcome");
  const fn = html.slice(start, start + 1600);
  for (const word of ["Hermes", "mailbox", "envelope", "relay", "DID"]) {
    assert.ok(!fn.includes(word), `banned word in welcome copy: ${word}`);
  }
});
