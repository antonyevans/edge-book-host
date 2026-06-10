# edge-book-host — design rules for new code

Read this BEFORE writing code. `ARCHITECTURE.md` is the map of what exists;
this file says where NEW code goes and what size limits apply.

## Where new code goes

| You are adding… | It goes in… |
|---|---|
| a new HTTP route | route entry in `src/server.ts` only if the handler is <30 lines; otherwise a new `src/routes-<feature>.ts` module called from the route table |
| WebSocket / channel frame handling | `src/channels.ts`; a new frame family → a new `src/channels-<family>.ts` module |
| persisted state | `src/store.ts` (`HostStore`, atomic single-file JSON); a new storage concern over ~100 lines → a new `src/store-<concern>.ts` |
| reader page markup | `src/reader-html.ts`; a NEW page → a new `src/reader-<page>.ts` generator |
| reader client logic | `src/reader-script.ts` (must stay valid standalone JS — syntax test parses it) |
| reader CSS / SVGs | `src/reader-styles.ts` / `src/reader-assets.ts` |
| token / auth primitives | `src/tokens.ts`; handle rules → `src/handles.ts` (must equal CLI `src/handles.ts`) |
| contract or wire-frame types | `src/contracts.ts` — shapes FROZEN; moving between files allowed, renaming/reshaping never |
| **anything you are unsure about** | **a NEW file — never append to an existing one** |

Appending to a large open file because it is already in context is the
failure mode these rules exist to prevent. Creating a new module is always
an acceptable answer; growing a 500-line file is not.

## Size limits (enforced by ESLint + agent hook + CI)

- **Files: 500 code lines max** (`max-lines`, error). Blank lines and comments
  don't count. At ~300 lines, plan the split before continuing.
- **Functions: 80 code lines** (warn); **complexity 15** (warn).
- A `/* eslint-disable max-lines */` requires a justification comment naming
  why splitting would tear one coherent concern, and a follow-up task to
  extract.

## Module conventions

- Reader UI split: markup `reader-html.ts`, client logic `reader-script.ts`,
  CSS `reader-styles.ts`, SVGs `reader-assets.ts`. Everything inline (strict
  CSP); all dynamic values pass `escapeText`/`escapeAttr`.
- Names encode intent (`handleMailboxAckFrame`, not `handle`). Internal renames
  only — frozen surfaces are listed in ARCHITECTURE.md.
- Comments state invariants ("host never reads blob plaintext"), not mechanics.

## When you split a file

1. Extract by feature (vertical slice), not by layer.
2. Update `ARCHITECTURE.md` module table in the same commit.
3. Typecheck + full test suite green after every extraction — one extraction
   per commit. Remember: merging to main deploys production.
