# edge-book-host — agent instructions

Read `ARCHITECTURE.md` for the code map. `docs/wire-protocol.md` is the
normative host↔agent protocol; `src/contracts.ts` is the canonical type seam
shared (by spec, not by import) with the `edge-book-cli` repo.

## Commands

```bash
npx tsc -p . --noEmit   # typecheck (strict) — must stay clean
npm test                # 78 tests via tsx --test — must stay green
npm run dev             # local server (tsx watch src/server.ts)
npm run build && npm start
```

Manual two-machine smoke: `docs/two-machine-smoke.md`.

## Deploy warning

**Pushing to main deploys production** (Fly.io via deploy.yml). Never merge a
branch to main without explicitly flagging this to the human.

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
