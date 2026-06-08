import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";

const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("reader fetches /api/ephemeral and /api/answers tolerantly", () => {
  assert.match(html, /api\("\/api\/ephemeral"\)\.catch/);
  assert.match(html, /api\("\/api\/answers"\)\.catch/);
});

test("reader renders ephemeral post cards with type labels and lifecycle filter", () => {
  assert.match(html, /function renderEphemeralCard/);
  assert.match(html, /EPHEMERAL_LABELS/);                 // type-label map
  assert.match(html, /eph-stale/);                        // stale styling hook
  // terminal states excluded from the feed
  assert.match(html, /"expired".*"cancelled".*"tombstoned"|EPHEMERAL_TERMINAL/);
});

test("reader renders answers as annotations on their parent query (R5), not a standalone view", () => {
  assert.match(html, /function answersForParent/);
  assert.match(html, /function renderAnswerAnnotations/);
  assert.match(html, /class="answer"/);
  assert.ok(!/data-view="answers"/.test(html), "answers must not be a standalone view (R5)");
  assert.match(html, /renderAnswerAnnotations\("edgebook:query:"/);   // wired onto query cards
});

test("reader ships CSS for ephemeral types + answer annotations", () => {
  for (const cls of [".eph-stale", ".eph-extra", ".answers", ".answer"]) {
    assert.ok(html.includes(cls), "missing CSS " + cls);
  }
});
