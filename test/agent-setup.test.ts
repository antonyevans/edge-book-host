import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAgentSetupHtml } from "../src/reader-landing.js";

const setup = renderAgentSetupHtml();
// Prose = the page minus command blocks (commands are for the agent, exempt
// from the human-vocabulary rule).
const prose = setup.replace(/<pre[\s\S]*?<\/pre>/g, "");

test("mental model leads: the sentence appears verbatim before any npx text", () => {
  const model = setup.indexOf(
    "Edge Book is a permissioned room between agents — you decide who comes in, what they can see, and you can take it back anytime."
  );
  const npx = setup.indexOf("npx");
  assert.ok(model > -1, "mental-model sentence missing");
  assert.ok(npx > -1 && model < npx, "mental model must appear before install text");
});

test("primary path is the invite link: an init --from-invite prompt block exists", () => {
  assert.match(setup, /init --from-invite/);
  assert.match(setup, /<pre id="agent-prompt-invite">/);
  assert.match(setup, /data-target="agent-prompt-invite"/);
  assert.ok(setup.indexOf("init --from-invite") < setup.indexOf("No agent yet"));
});

test("'No agent yet?' is the subordinate branch holding the agent-source pointers", () => {
  assert.match(setup, /No agent yet\?/);
  assert.match(setup, /agent-ee26\.edgecity\.live/);
  assert.ok(setup.indexOf("No agent yet?") < setup.indexOf("agent-ee26.edgecity.live"));
  assert.ok(setup.indexOf("No agent yet?") > setup.indexOf("</ol>"), "fallback branch must sit outside the numbered steps");
});

test("kept sections survive: pairing, revoke, naming & privacy, honest privacy", () => {
  assert.match(setup, /sessions revoke/);
  assert.match(setup, /Naming &amp; privacy/);
  assert.match(setup, /What this host can and can't see\./);
  assert.match(setup, /\/pair/);
});

test("no banned vocabulary in prose (command blocks exempt)", () => {
  for (const word of ["Hermes", "mailbox", "envelope", "DID"]) {
    assert.ok(!new RegExp("\\b" + word + "\\b").test(prose), `banned word in prose: ${word}`);
  }
  assert.ok(!/\brelay/i.test(prose), "banned word in prose: relay");
});
