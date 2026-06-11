# Reader Welcome State + /agent-setup Rewrite Implementation Plan (spec-131)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A freshly paired user with an empty room sees a one-screen welcome ("Your room." + mental model + their Add-me link/QR) instead of "Nothing yet.", and `/agent-setup` leads with the mental model and the invite-link path instead of install plumbing.

**Architecture:** Pure server-rendered-string changes in the host repo. The welcome card is a new renderer inside the reader's static client script (no-backticks template-literal sections), gated on a data-derived empty-room condition — no new state, cookies, routes, or `/api/*` surface. `/agent-setup` is a static HTML restructure in `reader-landing.ts`.

**Tech Stack:** TypeScript ESM, node:test via tsx (string/regex assertions on rendered HTML), ESLint max-lines 500.

**Spec:** `~/claude/edge-book-cli/docs/spec-131-reader-welcome-state.md` (approved, judge PASS ×3). Read it before starting.

**Repo:** `~/claude/edge-book-host`. Branch: `feat/131-reader-welcome`.

**Critical constraint — no backticks:** `reader-script-helpers.ts` and `reader-script-app.ts` bodies live inside static template literals (`READER_SCRIPT_HELPERS`, `READER_SCRIPT_APP`). All new client code uses **string concatenation with single quotes**, `var`/`function` style matching surrounding code, **no backticks, no `${}`**. `test/reader-script-syntax.test.ts` compiles the concatenated script; a backtick breaks the build.

---

### Task 1: Welcome card renderer + empty-room condition (reader script)

**Files:**
- Create: `test/reader-welcome.test.ts`
- Modify: `src/reader-script-helpers.ts` (after `renderAddMe`, ~line 230)
- Modify: `src/reader-script-app.ts:79` (feed fallback) and `:205-219` (QR population)
- Modify: `package.json:11` (register test file)

- [ ] **Step 1: Write the failing tests**

Create `test/reader-welcome.test.ts`:

```typescript
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
  // The link/QR block is emitted inside an if-guard on the invite-derived link.
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
```

- [ ] **Step 2: Register the test file and verify it fails**

In `package.json` line 11, append ` test/reader-welcome.test.ts` to the `"test"` script (inside the existing space-separated list, before the closing quote).

Run: `cd ~/claude/edge-book-host && npx tsx --test test/reader-welcome.test.ts`
Expected: FAIL — every assertion (no `isEmptyRoom`, no `renderWelcome` in output).

- [ ] **Step 3: Add `isEmptyRoom` and `renderWelcome` to reader-script-helpers.ts**

Insert directly after the closing `}` of `renderAddMe()` (line 230), before the `// Name precedence (spec-098)` comment. Match surrounding style — string concat, no backticks:

```javascript
  // spec-131: the empty-room condition is data-derived (the store is the
  // onboarding state — no flag, no cookie). contacts/feedItems are keyed
  // objects; shared is an array.
  function isEmptyRoom() {
    return values(state.contacts).length === 0 && values(state.feedItems).length === 0 && (state.shared || []).length === 0;
  }
  // spec-131: first-pairing welcome. Replaces "Nothing yet." only when the
  // room is truly empty; retires itself when the first friend/share arrives.
  // Vocabulary rule: no Hermes/mailbox/envelope/relay/DID/grant-as-noun.
  function renderWelcome(invite) {
    var head = '<section class="profile-panel welcome-card"><h2 class="welcome-title">Your room.</h2>' +
      '<p class="welcome-copy">Friends&#39; shares appear here. You decide who comes in, what they can see, and you can take anything back.</p>';
    var link = invite ? inviteAddLink() : null;
    var inviteBlock = "";
    if (link) {
      inviteBlock = '<p class="welcome-copy">Send this link to a friend &mdash; their agent does the rest.</p>' +
        '<div class="invite-link"><div class="invite-link-row"><input id="welcomeUrl" class="invite-url" readonly value="' + escapeHtml(link) + '">' +
        '<button type="button" class="primary" data-action="copy-invite" data-id="' + escapeHtml(link) + '">Copy</button></div></div>' +
        '<div class="invite-qr"><div id="welcomeQr" class="invite-qr-code" role="img" aria-label="QR code of your invite link"></div>' +
        '<div class="invite-qr-caption">Scan with a phone camera.</div></div>';
    }
    var actions = '<div class="empty-actions"><button type="button" data-view-target="add">Show my card</button></div>';
    return head + inviteBlock + actions + '</section>';
  }
```

- [ ] **Step 4: Wire the feed fallback in reader-script-app.ts:79**

Change:

```javascript
      html = (signalHtml + ephemeralHtml + feedHtml) || renderFeedEmpty();
```

to:

```javascript
      // spec-131: any rendered signal/ephemeral/feed content suppresses the
      // welcome by construction; isEmptyRoom() covers the rest.
      html = (signalHtml + ephemeralHtml + feedHtml) || (isEmptyRoom() ? renderWelcome(state.invite) : renderFeedEmpty());
```

- [ ] **Step 5: Extract `populateInviteQr` and add the feed branch (reader-script-app.ts:205-219)**

Replace the existing block:

```javascript
    // Render the invite QR (client-side, via the vendored qrcode generator).
    if (state.view === "add") {
      const qrEl = document.getElementById("inviteQr");
      const link = inviteAddLink();
      if (qrEl && link && typeof window.qrcode === "function") {
        try {
          const qr = window.qrcode(0, "L"); // type 0 = auto-fit, ECC level L (max capacity)
          qr.addData(link);
          qr.make();
          qrEl.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
        } catch (err) {
          qrEl.textContent = "Invite link is too long to encode as a QR; use the Copy button.";
        }
      }
    }
```

with:

```javascript
    // Render the invite QR (client-side, via the vendored qrcode generator).
    // spec-131: shared between the Add-me view and the feed welcome card; the
    // element-exists guard makes it a no-op when the block was omitted.
    function populateInviteQr(elementId) {
      const qrEl = document.getElementById(elementId);
      const link = inviteAddLink();
      if (qrEl && link && typeof window.qrcode === "function") {
        try {
          const qr = window.qrcode(0, "L"); // type 0 = auto-fit, ECC level L (max capacity)
          qr.addData(link);
          qr.make();
          qrEl.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
        } catch (err) {
          qrEl.textContent = "Invite link is too long to encode as a QR; use the Copy button.";
        }
      }
    }
    if (state.view === "add") populateInviteQr("inviteQr");
    if (state.view === "feed") populateInviteQr("welcomeQr");
```

- [ ] **Step 6: Run the new tests + syntax test**

Run: `npx tsx --test test/reader-welcome.test.ts test/reader-script-syntax.test.ts`
Expected: PASS (all). If the syntax test fails, a backtick or `${}` leaked in — fix before proceeding.

- [ ] **Step 7: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS. Watch `max-lines`: helpers was 380, app 426 — additions keep both under 500, but lint is the authority. If app exceeds 500, move `populateInviteQr` into `reader-script-helpers.ts` instead (it only uses `inviteAddLink`, defined there).

- [ ] **Step 8: Commit**

```bash
git add test/reader-welcome.test.ts src/reader-script-helpers.ts src/reader-script-app.ts package.json
git commit -m "feat(131): reader welcome state — empty-room condition + welcome card + shared QR helper"
```

---

### Task 2: Welcome-card styles

**Files:**
- Modify: `src/reader-styles.ts` (READER_STYLES literal — NOT `-sections.ts`/`-landing.ts`, which feed LANDING_STYLES)

- [ ] **Step 1: Add styles**

In `src/reader-styles.ts`, immediately after the `.invite-qr-caption` rule (line 258), add:

```css
/* spec-131: first-pairing welcome card */
.welcome-card { text-align: center; align-items: center; display: flex; flex-direction: column; gap: 12px; padding: 36px 24px; }
.welcome-title { margin: 0; font-size: 26px; }
.welcome-copy { margin: 0; max-width: 430px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.welcome-card .invite-link { width: 100%; max-width: 430px; }
.welcome-card .invite-qr-code svg { width: 152px; height: 152px; }
```

(`--muted`, `.invite-link-row`, `.invite-url`, `.invite-qr*`, `.empty-actions button` already exist in this sheet — reused, not redefined.)

- [ ] **Step 2: Run suite + lint**

Run: `npm test && npm run lint`
Expected: PASS (styles are inert for tests; lint guards file size — reader-styles.ts was 291 lines).

- [ ] **Step 3: Commit**

```bash
git add src/reader-styles.ts
git commit -m "feat(131): welcome-card styles in READER_STYLES"
```

---

### Task 3: /agent-setup rewrite

**Files:**
- Create: `test/agent-setup.test.ts`
- Modify: `src/reader-landing.ts:8-139` (`renderAgentSetupHtml`)
- Modify: `package.json:11` (register test file)

- [ ] **Step 1: Write the failing tests**

Create `test/agent-setup.test.ts`:

```typescript
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
  // and it precedes the no-agent fallback branch
  assert.ok(setup.indexOf("init --from-invite") < setup.indexOf("No agent yet"));
});

test("'No agent yet?' is the subordinate branch holding the agent-source pointers", () => {
  assert.match(setup, /No agent yet\?/);
  assert.match(setup, /agent-ee26\.edgecity\.live/);
  assert.ok(setup.indexOf("No agent yet?") < setup.indexOf("agent-ee26.edgecity.live"));
});

test("kept sections survive: pairing, revoke, naming & privacy, honest privacy", () => {
  assert.match(setup, /sessions revoke/);
  assert.match(setup, /Naming &amp; privacy/);
  assert.match(setup, /What this host can and can&#39;t see\.|What this host can and can't see\./);
  assert.match(setup, /\/pair/);
});

test("no banned vocabulary in prose (command blocks exempt)", () => {
  for (const word of ["Hermes", "mailbox", "envelope", "DID"]) {
    assert.ok(!new RegExp("\\b" + word + "\\b").test(prose), `banned word in prose: ${word}`);
  }
  // "relay"/"relayed" check, word-boundary, case-insensitive prose scan
  assert.ok(!/\brelay/i.test(prose), "banned word in prose: relay");
});
```

- [ ] **Step 2: Register + verify failure**

Append ` test/agent-setup.test.ts` to the `"test"` script in `package.json:11`.
Run: `npx tsx --test test/agent-setup.test.ts`
Expected: FAIL (mental-model sentence and `--from-invite` absent; "No agent yet" absent).

- [ ] **Step 3: Restructure `renderAgentSetupHtml()`**

Replace the intro header block (lines 28-34) and the `<ol class="setup-steps">` step 1 + step 2 (lines 35-64); keep steps 3 (pair) and 4 (revoke), the naming box, and the how-section untouched (renumber visible step numbers). New structure for the changed region:

```html
      <div class="setup-header">
        <div class="eyebrow">Agent setup</div>
        <h2>Edge Book is a permissioned room between agents — you decide who comes in, what they can see, and you can take it back anytime.</h2>
        <p class="lead" style="margin-top: 14px;">
          Your agent does the talking; this page gets it connected. Share this link with anyone whose agent should join — then send them to <a href="/pair">/pair</a> to enter their code.
        </p>
      </div>
      <ol class="setup-steps">
        <li class="setup-step">
          <div class="setup-step-num">1</div>
          <div class="setup-step-body">
            <h3>Arrived with an "Add me" link from a friend? Paste this to your agent.</h3>
            <p>Include the link where indicated — your agent sets up and pre-loads that friend so your first connection is one yes away.</p>
            <div class="prompt-block">
              <pre id="agent-prompt-invite">Set me up on Edge Book and give me a one-time pairing code. Edge Book is on npm, so no manual install is needed — npx fetches it.

1) Create my identity and pre-load my first friend (first time only):
  npx -y edge-book@latest init --from-invite &lt;paste the "Add me" link here&gt;

2) Start the dial-out and KEEP IT RUNNING (this is what the reader talks to):
  npx -y edge-book@latest dialout --host wss://edge-book-host.fly.dev/agent/ws

3) In a second shell, mint a pairing code and reply to me with the 8-character code it prints:
  npx -y edge-book@latest pair --host wss://edge-book-host.fly.dev/agent/ws

The code expires in 5 minutes — give it to me right away. Keep the dial-out from step 2 running while I use the reader.</pre>
              <button type="button" class="copy-btn" data-target="agent-prompt-invite">Copy</button>
            </div>
            <p class="muted">No link? Use the same message without the <code>--from-invite</code> part — your agent will show you pending introductions instead.</p>
          </div>
        </li>
        <li class="setup-step">
          <div class="setup-step-num">2</div>
          <div class="setup-step-body">
            <h3>No agent yet?</h3>
            <p>Edge Esmeralda attendees get one at <a href="https://agent-ee26.edgecity.live/" target="_blank" rel="noopener noreferrer">agent-ee26.edgecity.live</a>. Anyone else: run an <a href="https://github.com/anthropics/openclaw" target="_blank" rel="noopener noreferrer">openclaw</a> agent with Telegram or CLI access. The Edge Book CLI is on npm (<a href="https://www.npmjs.com/package/edge-book" target="_blank" rel="noopener noreferrer"><code>npx edge-book</code></a>) — no manual install needed. Then go back to step 1.</p>
          </div>
        </li>
```

Steps 3 and 4 keep their existing bodies (pair-the-browser and revoke), with `setup-step-num` values 3 and 4 unchanged. The old step-2 generic prompt block (`agent-prompt-setup`) is **removed** — the invite-path block plus its "No link?" line covers both cases; the test asserting `sessions revoke` and `/pair` survival guards the kept sections.

- [ ] **Step 4: Run the new tests**

Run: `npx tsx --test test/agent-setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS. (`reader-landing.ts` was 316 lines; the rewrite is roughly size-neutral.)

- [ ] **Step 6: Commit**

```bash
git add test/agent-setup.test.ts src/reader-landing.ts package.json
git commit -m "feat(131): /agent-setup leads with mental model + invite-link path; install is the fallback branch"
```

---

### Task 4: PR, deploy, live verification

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/131-reader-welcome
gh pr create --title "spec-131: reader welcome state + /agent-setup rewrite" --body "Implements docs/spec-131 (judge-approved). Welcome card on empty room (data-derived, organic retirement); /agent-setup leads with mental model + invite path. No server/API changes."
```

- [ ] **Step 2: Merge after CI green, deploy**

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull
flyctl deploy
```

Expected: deploy completes; `curl -s https://edge-book-host.fly.dev/healthz` → 200. (Known ops gotcha: a stuck machine lease 502s — recovery is re-running `flyctl deploy`.)

- [ ] **Step 3: Live verification**

- `curl -s https://edge-book-host.fly.dev/agent-setup | grep -c "permissioned room"` → ≥1, and the page shows the invite path first.
- Pair a fresh test agent (zero friends) and confirm the reader shows "Your room.", the mental-model sentence, the invite link + QR, and no setup instructions; confirm an account WITH content still renders the normal feed.

- [ ] **Step 4: Close out**

Update EA task `ea-claude-132` (status review/done per verification), append verification evidence to the task body.

---

## Self-review notes

- Spec §A condition/predicates → Task 1 Steps 3-4 (exact predicates, exact line-79 expression). Spec §A copy → Step 3 (verbatim strings). Spec §A QR/id separation + degradation → Steps 3/5 (arg-guarded block, element-exists guard). Spec §A no-backticks → constraint header + syntax test in Step 6.
- Spec §B order/mental model/invite-first/subordinate branch/kept sections → Task 3 Step 3; banned-vocab prose test → Task 3 Step 1.
- Spec §C (no server changes) → no task touches server.ts; nothing added.
- Spec test list → Tasks 1/3 test files; suite/lint gates in every task.
- Type consistency: `renderWelcome(invite)` defined Task 1 Step 3, called with `state.invite` Step 4; `populateInviteQr(elementId)` defined and called Step 5 — names match tests in Step 1.
