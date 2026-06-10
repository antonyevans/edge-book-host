import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
import { renderAddHtml, renderAgentSetupHtml, renderOfflineHtml } from "../src/reader-landing.js";
import { renderPairHtml } from "../src/reader-pair.js";

// Regression guard for ea-claude-070: the inline reader JS lives inside a
// template-literal string, so `tsc` never parses it and the HTML-substring
// tests never run it. A quote/escaping slip (e.g. `\'` collapsing to a bare
// `'` inside the template literal) produces a SyntaxError that kills the whole
// <script> at runtime while every other gate stays green. Parse each emitted
// <script> body with `new Function` (compiles without executing — no DOM
// needed) so a broken script fails CI instead of shipping a dead reader.
function scriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) bodies.push(m[1]!);
  return bodies;
}

const pages: Array<[string, string]> = [
  ["renderReaderHtml", renderReaderHtml({ csrf_token: "t", agent_online: false })],
  ["renderPairHtml", renderPairHtml({ csrf_token: "t" })],
  ["renderAgentSetupHtml", renderAgentSetupHtml()],
  ["renderOfflineHtml", renderOfflineHtml()],
  ["renderAddHtml", renderAddHtml()],
];

for (const [name, html] of pages) {
  test(`${name}: every inline <script> is syntactically valid JS`, () => {
    const bodies = scriptBodies(html);
    bodies.forEach((body, i) => {
      assert.doesNotThrow(
        () => new Function(body),
        `inline <script> #${i + 1} in ${name} has a JS syntax error`,
      );
    });
  });
}

test("renderReaderHtml emits at least one inline script", () => {
  assert.ok(scriptBodies(renderReaderHtml({ csrf_token: "t", agent_online: false })).length >= 1);
});
