# LLM-Legibility Refactor — edge-book-host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Make edge-book-host legible to a context-free LLM agent with zero behavior change.

**Architecture:** The repo is already well-factored (server/channels/store/contracts/handles/tokens/rate-limit each one concern). The single god file is `src/reader-html.ts` (2,399 lines), which is ~73% embedded template literals. Move the three literal blocks (reader script, SVG assets, style sheets) into sibling modules; keep all render functions and exports in `reader-html.ts` unchanged. Add invariant headers and the two index docs.

**Tech Stack:** TypeScript (tsc, strict), Node test runner via tsx. Deploy: Fly.io on push to main (do NOT merge without flagging).

## Baseline (2026-06-09, commit 97379a5)
- `npx tsc -p . --noEmit` → clean (exit 0)
- `npm test` → 78 pass / 0 fail

## Frozen surfaces
- `src/contracts.ts` — CANONICAL Contract 1/2 + wire frames. Comments may be added; names/shapes/serialized forms may NOT change. The CLI repo mirrors these by spec.
- `docs/wire-protocol.md` — normative; no edits needed by this refactor.
- `vendor/reader-src/` — one-way port from the CLI; do not touch, do not re-unify.
- HTTP routes, WebSocket frames, reader HTML behavior, deep-link formats, Dockerfile/fly.toml/deploy.yml.
- Test assertions/fixtures/inputs.

## Per-step gate
```bash
npx tsc -p . --noEmit && npm test 2>&1 | tail -8
```
Expected: exit 0; `# pass 78` / `# fail 0`.

### Task 1: Extract `READER_SCRIPT` → `src/reader-script.ts`
- [ ] Move lines 669–1438 (`const READER_SCRIPT = `<script>...`;`) verbatim to `src/reader-script.ts`, `export const READER_SCRIPT`. Header comment: this is the reader's entire client-side app, served inline (no bundler); `test/reader-script-syntax.test.ts` parses it for syntax; it talks only to `/api/*` + `/auth/*`.
- [ ] Import in `reader-html.ts`. Gate. Commit: `refactor: extract reader client script from reader-html.ts`

### Task 2: Extract SVG/icon assets and copy-button script → `src/reader-assets.ts`
- [ ] Move `FLOATING_ISLAND_SVG`, `PAIR_QR_SVG`, `BROWSER_ICON_SVG`, `HOST_ICON_SVG`, `VAULT_ICON_SVG`, `COPY_BUTTON_SCRIPT` (1440–1604) verbatim; export each. Gate. Commit: `refactor: extract inline SVG assets from reader-html.ts`

### Task 3: Extract style sheets → `src/reader-styles.ts`
- [ ] Move `LANDING_STYLES` (1605–2128) and `READER_STYLES` (2129–end) verbatim; export. Gate. Commit: `refactor: extract style sheets from reader-html.ts`

### Task 4: Invariant headers
- [ ] `reader-html.ts`: render-function map + "all user data must pass escapeText/escapeAttr" invariant. `server.ts`: route table + trust boundaries (public vs session+CSRF vs channel-authenticated). `channels.ts`: wire-protocol pointer + header-stripping invariant. `store.ts`: persistence + mailbox at-least-once + TOFU + handle registry invariants. Gate. Commit: `docs: add invariant headers to host core modules`

### Task 5: ARCHITECTURE.md (50–150 lines) + CLAUDE.md (≤100) + FINDINGS.md
- [ ] Module list, entry point (`server.ts`), data flows (pair, proxy, mailbox, handles), contract-sync rule, deploy warning (push to main = production deploy). Gate. Commit: `docs: add ARCHITECTURE.md, CLAUDE.md, FINDINGS.md`

### Task 6: Phase 4 gate
- [ ] `npx tsc -p . --noEmit` → exit 0
- [ ] `npm test` → 78/78
- [ ] From the CLI worktree: `npm run smoke` (10/10) and `npm run harness:e2e` (PASS) — they spawn the host from source if wired, else run CLI-local; plus host `test/convergence.test.ts` already covers the cross-repo seam.
- [ ] Spec re-read (wire-protocol.md, spec-096 host side, spec-098 host side) with citations.
- [ ] Full diff review: moves/comments/docs only.
