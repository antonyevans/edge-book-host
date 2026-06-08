import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";

const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

// B1: fetch /api/received tolerantly
test("reader fetches /api/received tolerantly", () => {
  assert.match(html, /api\("\/api\/received"\)\.catch/);
});

// B2: merge received signals and ephemeral from peers
test("feed merges received signals and ephemeral from peers", () => {
  assert.match(html, /state\.received\.signals/);
  assert.match(html, /state\.received\.ephemeral/);
});

// B3: annotation lookups include received answers + endorsements
test("annotation lookups include received answers + endorsements", () => {
  assert.match(html, /state\.received\.answers/);
  assert.match(html, /state\.received\.endorsements/);
});
