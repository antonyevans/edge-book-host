import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";

const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("reader fetches the four post-taxonomy collections tolerantly", () => {
  for (const ep of ["/api/signals", "/api/capabilities", "/api/endorsements", "/api/attestations"]) {
    assert.ok(html.includes(ep), `missing fetch for ${ep}`);
  }
  // each must be wrapped in a .catch so older agents don't break the reader
  assert.match(html, /api\("\/api\/signals"\)\.catch/);
});

test("reader defines endorsement-annotation helpers", () => {
  assert.match(html, /function endorsementsForParent/);
  assert.match(html, /function attestationForEndorsement/);
  assert.match(html, /function renderEndorsementAnnotations/);
  // R5: rendered as annotation markup, and there is NO standalone endorsements nav view
  assert.match(html, /class="endorsement"/);
  assert.ok(!/data-view="endorsements"/.test(html), "endorsements must not be a standalone view (R5)");
});

test("reader renders signals in the feed with lifecycle handling", () => {
  assert.match(html, /function renderSignalCard/);
  assert.match(html, /signal-stale/);          // stale styling hook
  // expired signals hidden by default
  assert.match(html, /lifecycle !== "expired"/);
});

test("reader appends endorsement annotations to shared objects (R5)", () => {
  // shared-object render path must reference the object-uri annotation hook
  assert.match(html, /renderEndorsementAnnotations\("edgebook:object:"/);
});

test("reader renders capabilities on the profile, not in the feed (R3)", () => {
  assert.match(html, /function renderCapabilities/);
  assert.match(html, /class="capabilities"/);
  assert.match(html, /capability deprecated/);   // deprecated styling hook
});

test("reader ships Edge Book CSS for the new post types", () => {
  for (const cls of [".endorsement", ".endorsement-evidence", ".capabilities", ".capability.deprecated", ".signal-stale"]) {
    assert.ok(html.includes(cls), `missing CSS for ${cls}`);
  }
});
