# edge-book-host — agent instructions

Read `ARCHITECTURE.md` for the code map. `docs/wire-protocol.md` is the
normative host↔agent protocol; `src/contracts.ts` is the canonical type seam
shared (by spec, not by import) with the `edge-book-cli` repo.

## Size rules (read first — a hook enforces these)

- No source file may exceed 500 code lines (`npm run lint`; a PostToolUse hook
  blocks oversized edits).
- New features get new modules — see @DESIGN.md for the placement table.
  **If unsure where code goes: create a new file, never append.**
- Never add `eslint-disable max-lines` without a justification comment and a
  follow-up extraction task.

## Verification commands (spec-0042 — run before claiming done)

All non-interactive with meaningful exit codes. A completion claim names the
command(s) run and their observed output — "done" without evidence is not done.

```bash
npx eslint src          # lint — size/style gates, must be clean
npx tsc -p . --noEmit   # typecheck (strict) — must stay clean
npm test                # full suite via tsx --test — must stay green
npm run build && npm start   # production build + boot smoke
npm run dev             # local server (tsx watch src/server.ts) — dev only
```

Manual two-machine smoke: `docs/two-machine-smoke.md`.

CI (`deploy.yml`) runs lint → typecheck → tests on every push and PR; merging
on red is prohibited.

## Workflow (spec-0041 / spec-0042)

This repo is **deploy-on-merge**: merging or pushing to `main` deploys
production (Fly.io via deploy.yml). **Only the human merges main.** The
agent's last action on a task is requesting the merge with verification
evidence attached — never merging itself.

- Worktree + branch per task (`feat|fix|refactor|chore/<slug>`); never work on
  `main`. Hard ceiling: 4 parallel agent sessions per repo (default 2–3).
- Target PR size ≤ ~400 changed lines of authored code; bigger work splits
  into independently reviewable stacked PRs.
- Production-bound work gets a **fresh-context review**: a separate session
  with no memory of writing the code reads the full diff before the PR is
  ready. Self-review by the writing session does not count.
- **Frozen tests:** during refactors, assertions/fixtures/inputs are frozen —
  a failing test means the step changed behavior; revert the step, never edit
  the test. A test believed wrong goes to FINDINGS.md untouched.
- New behavior ships with tests in the same PR, colocated per repo pattern.
- Generator modules (`reader-*.ts` render HTML/CSS/JS): refactor equivalence
  is a byte-level hash diff of rendered output, not passing tests alone.
- **Reversions:** agent code substantially rewritten or reverted within 30
  days of merge gets one line (date, PR, cause) in FINDINGS.md `## Reversions`.

## Frozen surfaces

- `src/contracts.ts` type names/shapes and all wire-frame fields
- HTTP routes, cookie names, CSRF scheme, deep-link formats (`/add#i=...`)
- `vendor/reader-src/` (one-way port from the CLI — do not edit or re-unify)
- Test assertions (the suite is the behavioral spec)

## Conventions

- Reader UI: markup in `reader-html.ts`, client logic in `reader-script.ts`,
  CSS in `reader-styles.ts`, SVGs in `reader-assets.ts`. Everything inline
  (strict CSP). All dynamic values must pass `escapeText`/`escapeAttr`.
- `test/reader-script-syntax.test.ts` parses the reader script literal — it
  catches syntax errors at test time; keep the script valid standalone JS.
- New persisted state goes in `HostStore` (atomic single-file JSON).
