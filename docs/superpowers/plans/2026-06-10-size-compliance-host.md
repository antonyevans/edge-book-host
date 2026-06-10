# edge-book-host Size-Compliance Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Extract reader-html.ts (626), reader-script.ts (762), reader-styles.ts (771) below 500 code lines each, delete their `eslint-disable max-lines` comments, with SERVED BYTES unchanged (sha256 of all 10 baseline artifacts in /tmp/baseline-hashes-host.txt must match after every step).

**Architecture:** Verbatim moves only. Generators stay byte-identical: page renderers move whole; the two big string constants are split at exact line boundaries into concatenated sections re-assembled in the original module via `${A}${B}` interpolation (zero `${`/backticks inside all moved content — verified). Importers updated to real modules (no barrels). tsx imports use `.js` specifiers.

**Conventions:** disable comment deleted LAST per file; `npx tsc -p . --noEmit` + `npm test` (80) + hash-diff after every commit; ARCHITECTURE.md row in same commit. FROZEN: contracts.ts, routes, deep-links, vendor/, test assertions. NEVER merge to main (deploys production).

### Task 0 — baseline ✓ (hashes captured, tsc clean, 80/80 tests)

### Task 1 — reader-html.ts (626 → ~150)
- [ ] Create `src/reader-escape.ts`: move `escapeText`/`escapeAttr` (lines 670–676), exported.
- [ ] Create `src/reader-pair.ts`: move `renderPairHtml` (176–359) verbatim; imports: LANDING_STYLES, PAIR_QR_SVG + BROWSER/HOST/VAULT icons + COPY_BUTTON_SCRIPT (check exact identifiers used in the block), escapeText/escapeAttr from reader-escape.
- [ ] Create `src/reader-landing.ts`: move `renderAgentSetupHtml` (360–498), `renderAddHtml` (499–628), `renderOfflineHtml` (629–668) verbatim with their imports.
- [ ] reader-html.ts keeps ReaderContext + renderReaderHtml; imports escapes from reader-escape; update `src/server.ts:25` and tests (`test/reader-add.test.ts`, `test/deeplink-add.test.ts`) to import page renderers from the new modules.
- [ ] Verify: tsc, tests, hash-diff (all 10). DELETE disable. Commit (+ARCHITECTURE.md).

### Task 2 — reader-script.ts (762 → ~15)
- [ ] Create `src/reader-script-helpers.ts`: `export const READER_SCRIPT_HELPERS = \`` + lines 11–350 verbatim + newline + `\`;` (state, api/headers, esc helpers, card/list renderers).
- [ ] Create `src/reader-script-app.ts`: `READER_SCRIPT_APP` = lines 351–770 (render(), actions, polling, boot, closing `})();`).
- [ ] reader-script.ts: `export const READER_SCRIPT = \`<script>\n${READER_SCRIPT_HELPERS}${READER_SCRIPT_APP}</script>\`;` (keep header comments).
- [ ] Verify: hash of READER_SCRIPT identical; `test/reader-script-syntax.test.ts` passes; tsc; full tests. DELETE disable. Commit (+ARCHITECTURE.md).

### Task 3 — reader-styles.ts (771 → ~290)
- [ ] Create `src/reader-styles-landing.ts`: `LANDING_SHELL_CSS` = lines 7–247 (tokens, landing shell, hero, pair card/QR) — content between `` `<style>`` opener and the `.how-section` rule.
- [ ] Create `src/reader-styles-sections.ts`: `LANDING_SECTIONS_CSS` = lines 248–529-end-of-literal (how-it-works pipes, setup steps, copy button) up to but excluding the closing `</style>\`;`.
- [ ] reader-styles.ts: `export const LANDING_STYLES = \`<style>\n${LANDING_SHELL_CSS}${LANDING_SECTIONS_CSS}</style>\`;` — EXACT bytes (inspect the literal's opener/closer lines first); READER_STYLES stays in reader-styles.ts (~262 lines).
- [ ] Verify: hashes of LANDING_STYLES/READER_STYLES + all pages identical; tsc; tests. DELETE disable. Commit (+ARCHITECTURE.md).

### Task 4 — Phase 3 gate
- [ ] `npx eslint src --quiet` clean; `grep -rn "eslint-disable max-lines" src/` empty
- [ ] `npx tsc -p . --noEmit`; `npm test` 80/80; `npm run build`
- [ ] `npx tsx /tmp/hash-host.mts` == baseline (all 10)
- [ ] Read full branch diff; push; `gh pr create`. **DO NOT MERGE** (deploys production).
