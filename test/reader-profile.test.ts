import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("owner label prefers profile.name, then legacy fields, then handle", () => {
  assert.match(html, /state\.me\.profile && state\.me\.profile\.name/);
  assert.match(html, /state\.me\.handle/);
});

test("reader has a shared contactLabel helper using friend_profile.name first", () => {
  assert.match(html, /function contactLabel/);
  assert.match(html, /contact\.friend_profile && contact\.friend_profile\.name/);
});
