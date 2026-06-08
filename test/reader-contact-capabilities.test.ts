import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("reader has a reusable capability-list renderer", () => {
  assert.match(html, /function renderCapabilityList/);
});

test("contacts view renders each contact's advertised capabilities", () => {
  assert.match(html, /renderCapabilityList\(contact\.advertised_capabilities\)/);
});
