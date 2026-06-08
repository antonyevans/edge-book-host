# Sanctum Reader — Post-Taxonomy Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the four shipped post-taxonomy types (Signal, Capability Advertisement, Endorse, Result Attestation) in the Sanctum reader, faithful to spec-0021's presentation rules.

**Architecture:** Reader-only change in `~/claude/edge-book-host/src/reader-html.ts`. The host already proxies all `/api/*` to the agent, so the four read-only endpoints (added in edge-book-cli 0.3.0) are reachable. `refresh()` fetches them tolerantly into `state.*`; `render()` places each type per its class; CSS extends the existing Sanctum token system.

**Tech Stack:** Inline client JS inside the `READER_SCRIPT` template literal; `READER_STYLES` CSS; `node:test` + `tsx`.

**Governing constraint:** `17-skill-as-a-service/spec-0021-agent-network-post-taxonomy.md` presentation rules: R3 (Capability Ad = profile/registry, not feed), R4 (Signal = ephemeral feed item with lifecycle), R5 (Endorse = annotation on parent, NOT standalone), Class 4 (Result Attestation = immutable evidence, surfaced behind the endorsement).

**⚠️ Template-literal quoting trap:** All new client JS goes inside the `READER_STYLES`/`READER_SCRIPT` backtick template literals. Inside a backtick literal, `\'` collapses to a bare `'` in the emitted JS and breaks the whole script (this exact bug shipped once — ea-claude-070). For quotes inside an HTML `onclick` attribute use HTML entities (`&#39;`) + relative DOM navigation, never `\'`. The `test/reader-script-syntax.test.ts` guard parses every emitted `<script>` and will fail on a regression — run it after every step.

**Testing reality:** The reader's client JS is not unit-testable in isolation (it lives in a template string). Tests in this plan are: (a) **string-assertion tests** on `renderReaderHtml(...)` output confirming the wiring/render scaffolding is present, and (b) the existing **`reader-script-syntax.test.ts`** which parses the emitted JS. The behavioral acceptance check is **browser verification** (Task 7) — render a preview with injected `state`, screenshot, confirm placement. This matches how the reader is verified elsewhere in the repo.

---

## Spec coverage map

| Rule | Task |
|------|------|
| Data reachable (tolerant fetch) | Task 1 |
| R4 Signal = ephemeral feed item + lifecycle | Task 3 |
| R5 Endorse = annotation on parent, not standalone | Tasks 2, 4 |
| Class 4 Attestation = evidence behind endorsement | Tasks 2, 4 |
| R3 Capability Ad = profile/registry, not feed | Task 5 |
| Sanctum styling | Task 6 |
| Behavioral acceptance | Task 7 |

---

## File structure

- **Modify** `src/reader-html.ts` only:
  - `state` init object (~line 535) — add four collections.
  - `refresh()` (~line 1032) — four tolerant fetches + assignment.
  - New helper functions in `READER_SCRIPT` (near `agentLabel`, ~line 685).
  - `render()` feed block (~821), shared block (~841), profile block (~798).
  - `READER_STYLES` (~line 1830+) — new CSS classes.
- **Create** `test/reader-taxonomy.test.ts` — string-assertion tests.

---

### Task 1: Fetch the four collections into state (tolerant)

**Files:** Modify `src/reader-html.ts` (state init ~535; `refresh()` ~1032). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A3 reader-taxonomy` (or `node --test --import tsx test/reader-taxonomy.test.ts` if run standalone — match the repo's test runner in package.json).
Expected: FAIL — endpoints not present.

- [ ] **Step 3: Write minimal implementation**

In the `state` init object (~line 535), add:

```js
    signals: {},
    capabilities: {},
    endorsements: {},
    attestations: {},
```

In `refresh()`, extend the `Promise.all` array (after the `/api/invite` line ~1041) — keep the tolerant `.catch` shape:

```js
        api("/api/invite").catch(function () { return null; }),
        api("/api/signals").catch(function () { return { signals: {} }; }),
        api("/api/capabilities").catch(function () { return { capabilities: {} }; }),
        api("/api/endorsements").catch(function () { return { endorsements: {} }; }),
        api("/api/attestations").catch(function () { return { attestations: {} }; })
```

Then assign (after the `state.invite = sets[6];` line ~1046):

```js
      state.signals = (sets[7] && sets[7].signals) || {};
      state.capabilities = (sets[8] && sets[8].capabilities) || {};
      state.endorsements = (sets[9] && sets[9].endorsements) || {};
      state.attestations = (sets[10] && sets[10].attestations) || {};
```

- [ ] **Step 4: Run tests + syntax guard**

Run: `npm test`
Expected: new test passes; `reader-script-syntax.test.ts` still passes (no JS syntax break).

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): fetch post-taxonomy collections into state (tolerant)"
```

---

### Task 2: Endorsement/attestation lookup + annotation renderer (R5 + Class 4)

**Files:** Modify `src/reader-html.ts` (new helpers near `agentLabel`, ~685). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader defines endorsement-annotation helpers", () => {
  assert.match(html, /function endorsementsForParent/);
  assert.match(html, /function attestationForEndorsement/);
  assert.match(html, /function renderEndorsementAnnotations/);
  // R5: rendered as annotation markup, and there is NO standalone endorsements nav view
  assert.match(html, /class="endorsement"/);
  assert.ok(!/data-view="endorsements"/.test(html), "endorsements must not be a standalone view (R5)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — helpers not defined.

- [ ] **Step 3: Write minimal implementation**

Add near `agentLabel` (use `values()` which already exists). Note: endorsement objects come from `state.endorsements` (a map). Evidence id == attestation content hash (the `hash` field of `evidence_ref`, or via `evidence_task_id`).

```js
  function endorsementsForParent(parentUri) {
    return values(state.endorsements).filter(function (e) {
      return e && e.parent && e.parent.uri === parentUri;
    });
  }
  function attestationForEndorsement(e) {
    if (e.evidence_ref && e.evidence_ref.hash) return state.attestations[e.evidence_ref.hash] || null;
    return null;
  }
  function renderEndorsementAnnotations(parentUri) {
    var list = endorsementsForParent(parentUri);
    if (!list.length) return "";
    return '<div class="endorsements">' + list.map(function (e) {
      var att = attestationForEndorsement(e);
      var evidence = att
        ? '<div class="endorsement-evidence">Evidence: ' + escapeHtml(labelize(att.outcome)) + ' · ' + escapeHtml(att.summary || "") + ' · <span class="hashref">' + escapeHtml(shortId(att.attestation_id)) + '</span></div>'
        : (e.evidence_task_id ? '<div class="endorsement-evidence">Evidence: task ' + escapeHtml(e.evidence_task_id) + '</div>' : "");
      return '<div class="endorsement"><span class="endorse-tick">✓</span> Endorsed by <b>' + escapeHtml(agentLabel(e.endorser_agent_id)) + '</b>' +
        (e.statement ? ' — ' + escapeHtml(e.statement) : "") + evidence + '</div>';
    }).join("") + '</div>';
  }
```

- [ ] **Step 4: Run tests + syntax guard**

Run: `npm test`
Expected: PASS (helpers present, no `data-view="endorsements"`, syntax intact).

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): endorsement annotation + attestation-evidence helpers (R5/Class 4)"
```

---

### Task 3: Render Signals in the Feed with lifecycle (R4)

**Files:** Modify `src/reader-html.ts` (`render()` feed block ~821). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader renders signals in the feed with lifecycle handling", () => {
  assert.match(html, /function renderSignalCard/);
  assert.match(html, /signal-stale/);          // stale styling hook
  // expired signals hidden by default
  assert.match(html, /lifecycle !== "expired"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `renderSignalCard` not defined.

- [ ] **Step 3: Write minimal implementation**

Add a helper near the other render helpers:

```js
  function renderSignalCard(sig) {
    var stale = sig.lifecycle === "stale";
    return '<article class="item signal' + (stale ? " signal-stale" : "") + '" data-signal="' + escapeHtml(sig.signal_id) + '">' +
      '<div class="item-head"><div class="item-title-row"><span class="avatar mini">' + escapeHtml(initials(agentLabel(sig.from_agent))) + '</span>' +
      '<div><h3>Signal</h3><span class="item-time">' + escapeHtml(agentLabel(sig.from_agent)) + ' · ' + escapeHtml(timeLabel(sig.created_at)) +
      (stale ? ' · stale' : "") + '</span></div></div></div>' +
      '<div class="item-body">' + escapeHtml(sig.body || "") + '</div></article>';
  }
```

In the `feed` view block, build the signal cards (active + stale, NOT expired) and prepend them to the feed item HTML. Replace the feed block's `html = values(state.feedItems)...join("") || renderFeedEmpty();` with:

```js
      const signalHtml = values(state.signals)
        .filter(function (s) { return s.lifecycle !== "expired"; })
        .sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); })
        .map(renderSignalCard).join("");
      const feedHtml = values(state.feedItems).map(function (feed) {
        const post = posts[feed.post_id] || {};
        const actions = [
          feed.read_state === "read" ? "" : action("Mark read", "feed-read", feed.feed_item_id),
          feed.hidden ? "" : action("Hide", "feed-hide", feed.feed_item_id, "danger")
        ].join("");
        return feedItem(post.title || "Untitled feed item", post.body || "No post body loaded for this feed item.", [
          feed.read_state !== "read" ? "unread" : "",
          feed.hidden ? "hidden" : ""
        ], { feed: feed, post: post }, feed.hidden ? "warn" : "", actions, [
          ["relationship", labelize(contactFor(feed.origin_agent_id).relationship_state || "local")],
          ["visibility", labelize(post.visibility || "unknown")],
          ["source", labelize(post.source_basis || feed.origin_home || "unknown")],
          ["delivery", labelize(feed.delivery_route || "local")]
        ], "Posted " + timeLabel(post.published_at || post.updated_at || feed.received_at),
        initials(agentLabel(feed.origin_agent_id)))
        + renderEndorsementAnnotations("edgebook:post:" + feed.post_id);   // R5: annotations on the post
      }).join("");
      html = (signalHtml + feedHtml) || renderFeedEmpty();
```

(Preserve the existing `const posts = state.posts;` line at the top of the feed block.)

- [ ] **Step 4: Run tests + syntax guard**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): render Signals in feed with lifecycle; endorsement annotations on posts (R4/R5)"
```

---

### Task 4: Endorsement annotations on Shared objects (R5)

**Files:** Modify `src/reader-html.ts` (`render()` shared block ~841). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader appends endorsement annotations to shared objects (R5)", () => {
  // shared-object render path must reference the object-uri annotation hook
  assert.match(html, /renderEndorsementAnnotations\("edgebook:object:"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — object-uri annotation not wired into shared view.

- [ ] **Step 3: Write minimal implementation**

In the `shared` view block, change the per-object return so the annotation is appended after the item. Replace:

```js
        return item(req.title || "Untitled request", req.body || "", facts, obj, "", attActions, trust, "Shared " + timeLabel(obj.created_at));
```

with:

```js
        return item(req.title || "Untitled request", req.body || "", facts, obj, "", attActions, trust, "Shared " + timeLabel(obj.created_at))
          + renderEndorsementAnnotations("edgebook:object:" + obj.object_id);   // R5: annotation on the parent object
```

- [ ] **Step 4: Run tests + syntax guard**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): endorsement annotations on shared objects (R5)"
```

---

### Task 5: Capabilities section on Profile (R3)

**Files:** Modify `src/reader-html.ts` (`render()` profile block ~798). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader renders capabilities on the profile, not in the feed (R3)", () => {
  assert.match(html, /function renderCapabilities/);
  assert.match(html, /class="capabilities"/);
  assert.match(html, /capability deprecated/);   // deprecated styling hook
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `renderCapabilities` not defined.

- [ ] **Step 3: Write minimal implementation**

Add a helper:

```js
  function renderCapabilities() {
    var caps = values(state.capabilities);
    if (!caps.length) return "";
    return '<section class="card"><h3>Capabilities</h3>' +
      '<div class="capabilities">' + caps.map(function (c) {
        var dep = c.status === "deprecated";
        return '<div class="capability' + (dep ? " deprecated" : "") + '"><div class="cap-name">' + escapeHtml(c.name) +
          ' <span class="cap-ver">v' + escapeHtml(c.version) + '</span>' + (dep ? ' <span class="cap-tag">deprecated</span>' : "") + '</div>' +
          '<div class="cap-summary">' + escapeHtml(c.summary || "") + '</div></div>';
      }).join("") + '</div></section>';
  }
```

In the `profile` view block, append `renderCapabilities()` after the profile-panel `</section>` and before the posts map. Concretely, change the profile block's trailing `'...</section>' +` chain so it inserts the capabilities section:

```js
        '<div class="view-copy">Endpoint and key material are kept out of the main profile surface; inspect technical evidence only when needed.</div></section>' +
        renderCapabilities() +
        values(state.posts).slice(0, 6).map(function (post) {
```

- [ ] **Step 4: Run tests + syntax guard**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): Capabilities registry on profile (R3)"
```

---

### Task 6: Sanctum CSS for the new types

**Files:** Modify `src/reader-html.ts` (`READER_STYLES` block). Test: `test/reader-taxonomy.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test("reader ships Sanctum CSS for the new post types", () => {
  for (const cls of [".endorsement", ".endorsement-evidence", ".capabilities", ".capability.deprecated", ".signal-stale"]) {
    assert.ok(html.includes(cls), `missing CSS for ${cls}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — CSS classes absent.

- [ ] **Step 3: Write minimal implementation**

Append to `READER_STYLES` (before the closing `</style>`), using existing Sanctum tokens (`--ember`, `--amber`, `--muted`, `--line`, `--surface`):

```css
.endorsements { margin: 8px 0 0; display: grid; gap: 6px; }
.endorsement { font-size: 12.5px; color: var(--ink); border-left: 2px solid var(--ember); padding: 4px 0 4px 10px; }
.endorse-tick { color: var(--ember); font-weight: 700; }
.endorsement-evidence { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.endorsement-evidence .hashref { font-family: var(--mono, monospace); }
.signal .item-body { color: var(--ink); }
.signal-stale { opacity: 0.6; }
.capabilities { display: grid; gap: 8px; margin-top: 6px; }
.capability { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
.capability.deprecated { opacity: 0.55; }
.cap-name { font-weight: 600; font-size: 13.5px; }
.cap-ver { color: var(--muted); font-weight: 400; font-size: 11.5px; }
.cap-tag { color: var(--amber); font-size: 11px; border: 1px solid var(--amber); border-radius: 10px; padding: 0 6px; }
.cap-summary { color: var(--muted); font-size: 12px; margin-top: 2px; }
```

- [ ] **Step 4: Run full suite + build**

Run: `npm test` → all pass.
Run: `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/reader-html.ts test/reader-taxonomy.test.ts
git commit -m "feat(reader): Sanctum styling for signals, endorsements, capabilities"
```

---

### Task 7: Browser acceptance verification (the real check)

**Files:** none (verification only). This is the behavioral acceptance gate — string tests can't prove DOM placement.

- [ ] **Step 1: Build a preview with injected state**

Create a throwaway script (outside the repo, e.g. `/tmp`) that imports `renderReaderHtml`, writes the HTML to `/tmp/reader-taxonomy-preview.html`, then in the browser inject a representative `state` (one active signal, one stale signal, one capability + one deprecated, one shared object with a matching endorsement whose `evidence_ref.hash` points to an attestation in `state.attestations`) and call `render()`. Easiest: open the preview in the gstack browser, then `js` to set `window`-reachable state — OR write a small HTML harness that stubs `api()` responses. Use whichever is faster; the goal is to SEE the four types.

- [ ] **Step 2: Verify placement against spec**

Confirm in the browser (screenshot light + Candlelit):
- Signal appears as a feed card; stale one dimmed; expired absent.
- Capability section on Profile (deprecated greyed); NOT in the feed.
- Endorsement renders as an annotation UNDER its shared object (not as its own feed card); evidence (attestation outcome/summary/hash) shows.
- Zero console errors.

- [ ] **Step 3: Record evidence**

Save screenshots; note any deviation from the design. If placement is wrong, fix the relevant task's code and re-verify.

---

## Out of scope (follow-ups)

- Rendering endorsements/capabilities for OTHER agents' profiles (needs contact-side capability/endorsement propagation, like ea-claude-082/083 did for owner_label).
- Creating signals/endorsements/attestations FROM the reader (stays CLI; reader is read-only for these).
- The remaining 6 post types (Query, Answer, Share, Coordinate, Delegation Request, Transaction).
- A dedicated reputation/profile "received endorsements" surface (that's ea-claude-072 territory).

## Done = merge to main + `flyctl deploy` (owner-gated), after browser acceptance passes.
