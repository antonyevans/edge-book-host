# Sanctum Reader — Remaining Post Types Rendering Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Render the five new post types in the Sanctum reader: Query/Share/Coordinate/Delegation Request (Class 2) as feed cards with lifecycle, and Answer (Class 3) as annotations on its parent Query.

**Architecture:** Reader-only change in `~/claude/edge-book-host/src/reader-html.ts`, a direct extension of the existing pattern (Signals already render as feed cards via `renderSignalCard`; Endorsements as annotations via `renderEndorsementAnnotations`). Fetch `/api/ephemeral` + `/api/answers` (already served by edge-book 0.4.0; the host proxies all `/api/*`) into `state`, render in the feed + as annotations.

**Tech Stack:** Inline client JS in `READER_SCRIPT`; CSS in `READER_STYLES`; `node:test`.

**Governing constraint:** spec-0021 — R4 (Class-2 lifecycle: hide terminal expired/cancelled/tombstoned, dim stale), R5 (Answer = annotation on parent Query, NOT a standalone view). Mirror the Signal/Endorsement treatment already shipped.

**⚠️ Template-literal quoting trap:** new client JS goes inside the `READER_SCRIPT`/`READER_STYLES` backtick literals. NEVER use `\'` (it collapses to a bare `'` and breaks the whole script — shipped once). Use `escapeHtml()` for all dynamic content; HTML entities for any attribute quotes. `test/reader-script-syntax.test.ts` parses the emitted JS — run the suite after every step.

**Testing reality:** node tests are string-assertions on `renderReaderHtml(...)` output + the syntax guard. Behavioral acceptance = browser verification (Task 5), seeded with a fetch-mock — same approach as the prior reader round.

---

## File structure
- **Modify** `src/reader-html.ts` only: `state` init (~538), `refresh()` fetch+assign (~1097), new helpers near `renderSignalCard`/`renderEndorsementAnnotations` (~656/720), feed render block (~869), CSS in `READER_STYLES`.
- **Create** `test/reader-remaining-types.test.ts`; add it to `package.json` `test` script.

---

### Task 1: Fetch ephemeral + answers into state (tolerant)

**Files:** Modify `src/reader-html.ts`. Test: `test/reader-remaining-types.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("reader fetches /api/ephemeral and /api/answers tolerantly", () => {
  assert.match(html, /api\("\/api\/ephemeral"\)\.catch/);
  assert.match(html, /api\("\/api\/answers"\)\.catch/);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (endpoints not fetched). (Add `test/reader-remaining-types.test.ts` to the `test` script in `package.json` now.)

- [ ] **Step 3: Implement.** In `state` init (after `attestations: {}` ~541), add:
```js
    ,ephemeral: {}
    ,answers: {}
```
(Ensure valid object syntax — append as new keys with commas matching the existing style.)

In `refresh()`, extend the `Promise.all` (after the `/api/attestations` line ~1100):
```js
        api("/api/attestations").catch(function () { return { attestations: {} }; }),
        api("/api/ephemeral").catch(function () { return { ephemeral: {} }; }),
        api("/api/answers").catch(function () { return { answers: {} }; })
```
And assign (after `state.attestations = ...` ~1109):
```js
      state.ephemeral = (sets[11] && sets[11].ephemeral) || {};
      state.answers = (sets[12] && sets[12].answers) || {};
```
(Confirm the existing indices; attestations is sets[10], so ephemeral=sets[11], answers=sets[12].)

- [ ] **Step 4: Run** `npm test` → PASS (+ syntax guard green).

- [ ] **Step 5: Commit**
```bash
git add src/reader-html.ts test/reader-remaining-types.test.ts package.json
git commit -m "feat(reader): fetch ephemeral + answers into state (tolerant)"
```

---

### Task 2: Render Class-2 ephemeral types in the feed with lifecycle (R4)

**Files:** Modify `src/reader-html.ts` (helper near `renderSignalCard` ~663; feed block ~869). Test: `test/reader-remaining-types.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader renders ephemeral post cards with type labels and lifecycle filter", () => {
  assert.match(html, /function renderEphemeralCard/);
  assert.match(html, /EPHEMERAL_LABELS/);                 // type-label map
  assert.match(html, /eph-stale/);                        // stale styling hook
  // terminal states excluded from the feed
  assert.match(html, /"expired".*"cancelled".*"tombstoned"|EPHEMERAL_TERMINAL/);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement.** Add near `renderSignalCard`:

```js
  var EPHEMERAL_LABELS = { query: "Query", share: "Share", coordinate: "Coordinate", delegation_request: "Delegation Request" };
  var EPHEMERAL_TERMINAL = { expired: 1, cancelled: 1, tombstoned: 1 };
  function renderEphemeralCard(post) {
    var stale = post.lifecycle === "stale";
    var label = EPHEMERAL_LABELS[post.post_type] || "Post";
    var extra = "";
    if (post.post_type === "share" && post.ref) extra = '<div class="eph-extra">↗ ' + escapeHtml(post.ref) + '</div>';
    else if (post.post_type === "delegation_request" && post.subject_agent_id) extra = '<div class="eph-extra">to ' + escapeHtml(agentLabel(post.subject_agent_id)) + '</div>';
    else if (post.post_type === "coordinate" && post.subject_agent_id) extra = '<div class="eph-extra">with ' + escapeHtml(agentLabel(post.subject_agent_id)) + '</div>';
    return '<article class="item signal eph' + (stale ? " eph-stale" : "") + '" data-eph="' + escapeHtml(post.post_id) + '">' +
      '<div class="item-head"><div class="item-title-row"><span class="avatar mini">' + escapeHtml(initials(agentLabel(post.from_agent))) + '</span>' +
      '<div><h3>' + escapeHtml(label) + '</h3><span class="item-time">' + escapeHtml(agentLabel(post.from_agent)) + ' · ' + escapeHtml(timeLabel(post.created_at)) +
      (stale ? ' · stale' : "") + '</span></div></div></div>' +
      '<div class="item-body">' + escapeHtml(post.body || "") + '</div>' + extra + '</article>';
  }
```

In the `feed` block, build `ephemeralHtml` (active+stale only, terminal hidden) and merge. After the `signalHtml` declaration (~874), add:

```js
      const ephemeralHtml = values(state.ephemeral)
        .filter(function (p) { return !EPHEMERAL_TERMINAL[p.lifecycle]; })
        .sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); })
        .map(function (p) {
          return renderEphemeralCard(p) + (p.post_type === "query" ? renderAnswerAnnotations("edgebook:query:" + p.post_id) : "");
        }).join("");
```

Change the final feed assignment (~893) from `html = (signalHtml + feedHtml) || renderFeedEmpty();` to:
```js
      html = (signalHtml + ephemeralHtml + feedHtml) || renderFeedEmpty();
```

(`renderAnswerAnnotations` is defined in Task 3 — function declarations hoist, so order is fine, but commit Task 2 + 3 together if the suite's syntax guard complains about a reference before the function exists at parse time. It won't — declarations hoist. If you prefer, implement Task 3's helper first.)

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/reader-html.ts test/reader-remaining-types.test.ts
git commit -m "feat(reader): render Class-2 ephemeral types in feed with lifecycle (R4)"
```

---

### Task 3: Render Answers as annotations on their parent Query (R5)

**Files:** Modify `src/reader-html.ts` (near `renderEndorsementAnnotations` ~720). Test: `test/reader-remaining-types.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader renders answers as annotations on their parent query (R5), not a standalone view", () => {
  assert.match(html, /function answersForParent/);
  assert.match(html, /function renderAnswerAnnotations/);
  assert.match(html, /class="answer"/);
  assert.ok(!/data-view="answers"/.test(html), "answers must not be a standalone view (R5)");
  assert.match(html, /renderAnswerAnnotations\("edgebook:query:"/);   // wired onto query cards
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement.** Add near `renderEndorsementAnnotations`:

```js
  function answersForParent(parentUri) {
    return values(state.answers).filter(function (a) {
      return a && a.parent && a.parent.uri === parentUri && a.lifecycle !== "tombstoned";
    });
  }
  function renderAnswerAnnotations(parentUri) {
    var list = answersForParent(parentUri);
    if (!list.length) return "";
    return '<div class="answers">' + list.map(function (a) {
      return '<div class="answer"><span class="answer-arrow">↳</span> <b>' + escapeHtml(agentLabel(a.answerer_agent_id)) + '</b>' +
        (a.body ? ' — ' + escapeHtml(a.body) : "") + '</div>';
    }).join("") + '</div>';
  }
```

(The wiring `renderAnswerAnnotations("edgebook:query:" + p.post_id)` was added in Task 2's feed block — verify it's present.)

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/reader-html.ts test/reader-remaining-types.test.ts
git commit -m "feat(reader): answers as annotations on parent query (R5)"
```

---

### Task 4: Sanctum CSS for ephemeral types + answer annotations

**Files:** Modify `src/reader-html.ts` (`READER_STYLES`). Test: `test/reader-remaining-types.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader ships CSS for ephemeral types + answer annotations", () => {
  for (const cls of [".eph-stale", ".eph-extra", ".answers", ".answer"]) {
    assert.ok(html.includes(cls), "missing CSS " + cls);
  }
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement.** Append to `READER_STYLES` (before `</style>`), reusing Sanctum tokens:
```css
.eph-stale { opacity: 0.6; }
.eph-extra { color: var(--muted); font-size: 12px; margin-top: 4px; }
.answers { margin: 8px 0 0; display: grid; gap: 6px; }
.answer { font-size: 12.5px; color: var(--ink); border-left: 2px solid var(--ember); padding: 4px 0 4px 10px; }
.answer-arrow { color: var(--ember); font-weight: 700; }
```

- [ ] **Step 4: Run** `npm test` → all pass; `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/reader-html.ts test/reader-remaining-types.test.ts
git commit -m "feat(reader): Sanctum styling for ephemeral types + answers"
```

---

### Task 5: Browser acceptance (the real check)

**Files:** none (verification only).

- [ ] **Step 1:** Render a seeded preview: import `renderReaderHtml`, inject a `<script>` (after `</head>`) that mocks `window.fetch` to return, for `/api/ephemeral`, one of each type (a `query` plus a `share` with `ref`, a `coordinate`/`delegation_request` with `subject_agent_id`, one `stale`, one `cancelled`); for `/api/answers`, one answer whose `parent.uri` = `edgebook:query:<the query id>`; plus minimal `/api/me`, `/api/contacts`, `/api/feed`, `/api/posts`, `/api/approvals`, `/api/audit`, `/api/shared-objects`, `/api/invite`, `/api/signals`, `/api/capabilities`, `/api/endorsements`, `/api/attestations` (empty ok). Write to `/tmp`, open in the gstack browser, wait for `refresh()`.

- [ ] **Step 2: Verify (screenshot the feed):**
  - Query, Share (with ref), Coordinate/Delegation (with subject) render as feed cards with their type labels.
  - The stale one is dimmed; the cancelled/terminal one is absent.
  - The Answer renders as an annotation UNDER the Query card (not its own card).
  - Zero console errors.

- [ ] **Step 3:** Record screenshots; fix any placement deviation in the relevant task and re-verify.

---

## Out of scope (follow-ups)
- Transaction type (deferred).
- Creating these from the reader (stays CLI; reader is read-only).
- Rendering OTHER agents' answers/ephemerals beyond what the feed shows.

## Done = merge to main + `flyctl deploy` (owner-gated) after browser acceptance.
