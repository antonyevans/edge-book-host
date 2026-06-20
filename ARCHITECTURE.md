# edge-book-host — code map

Relay + reader host for Edge Book. Serves the browser reader UI, relays opaque
envelopes between dial-out agents, and runs the handle registry. Pairs with the
`edge-book-cli` repo (npm `edge-book`), which implements the agent side.

## Entry point

`src/server.ts` — the single HTTP + WebSocket server. Build `tsc -p .`, run
`node dist/server.js`. Deployed to Fly.io by `.github/workflows/deploy.yml`
**on every push to main** (a merge IS a production deploy).

## Modules (src/)

| File | Responsibility |
|---|---|
| `server.ts` | all HTTP routes + the `/agent/ws` upgrade; trust boundaries documented in its header |
| `channels.ts` | live agent sockets: hello/TOFU, api_request proxying, mailbox relay, handle_claim, stand_down |
| `store.ts` | all persistence: pairing codes, sessions, device tokens, channel meta, mailbox queue, handle registry |
| `contracts.ts` | CANONICAL Contract 1 (Transport/mailbox) + Contract 2 (object/grant/audit) + wire frame types — FROZEN |
| `handles.ts` | handle slug rules + claim signature verification (spec-096) |
| `tokens.ts` | token/pairing-code generation, channel_id derivation, timing-safe compare |
| `rate-limit.ts` | fixed-window limiter for /pair |
| `support.ts` | operator support mailbox (spec-134): SUPPORT_DID discovery route + frame-level size/rate guard for support sends |
| `funnel.ts` | activation-funnel instrumentation (spec-142): metadata-derived stage stamps, system-DID exclusion, bounded store with `__aggregate__` fold, `/admin/funnel` cohort report |
| `werewolf.ts` | Village Werewolf live-demo routes (`/werewolf` + `/werewolf/events`): in-memory snapshot, admin-token push (reuses `ADMIN_TOKEN`), public projector read. Game runs off-host; this is display + relay only |
| `werewolf-html.ts` | Village Werewolf projector + join page renderer (`renderWerewolfHtml`); polls `/werewolf/events` under strict CSP |
| `reader-html.ts` | server-rendered reader app shell (`renderReaderHtml`) |
| `reader-pair.ts` | pairing-code landing page (`/pair` form + QR + how-it-works) |
| `reader-landing.ts` | static landing pages: agent setup, "Add me" deep link, offline interstitial |
| `reader-escape.ts` | HTML escaping (`escapeText`/`escapeAttr`) shared by all page renderers |
| `reader-script.ts` | assembles the reader's inline client app from the two script sections |
| `reader-script-helpers.ts` | reader script section 1: state, api plumbing, card/list renderers |
| `reader-script-app.ts` | reader script section 2: render() dispatcher, actions, polling, deep-link boot |
| `reader-styles.ts` | assembles LANDING_STYLES from its two sections; holds READER_STYLES |
| `reader-styles-landing.ts` | landing CSS section 1: tokens, shell, hero, pairing card |
| `reader-styles-sections.ts` | landing CSS section 2: pipe diagram, setup steps, footer, copy button |
| `reader-assets.ts` | inline SVG assets (strict CSP, nothing remote) |
| `qrcode-lib.ts` | vendored QR generator served to the pair page |

`vendor/reader-src/` is a ONE-WAY port snapshot from the CLI repo — reference
only, never imported, never edited to "sync" it.

## Key data flows

- **Pair:** agent `pair_register` (code→channel) → human enters code at `/pair` → host mints session + device cookies bound to that channel_id.
- **Proxy:** browser `/api/*` → host frames `api_request` onto the channel → agent's local API answers → `api_response` correlated by request_id (30s timeout → 504).
- **Mailbox:** `mailbox_send` → durable queue (`to` = channel_id or DID) → `mailbox_deliver` on connect → deleted only on `mailbox_ack`. Host never reads blob plaintext.
- **Handles:** `handle_claim` (signature-verified, first-come per DID) → `GET /handle/:handle` returns the signed card (spec-096).

## Cross-repo contract rule (critical)

`src/contracts.ts` + `docs/wire-protocol.md` are the canonical seam. The CLI
repo REIMPLEMENTS these types — there is no compiler across the seam. You may
move them between files; you may NOT rename or reshape them, ever, without a
coordinated change in `edge-book-cli`.

`schemas/wire-frames.schema.json` is the canonical MACHINE-READABLE contract
artifact, generated from `src/contracts.ts` by `npm run schemas` (which also
emits the runtime embed `src/wire-schema.ts` — generated, never hand-edited).
Any change to the seam must regenerate both; `npm run schemas:check` (run in
CI) fails on drift, and CI also diffs the schema against the copy vendored in
`edge-book-cli`. Inbound agent frames are validated against it fail-closed at
the ws seam (`src/frame-validate.ts`).

## Do not touch casually

- `src/contracts.ts` shapes, wire frame fields, HTTP route paths
- `vendor/reader-src/` (one-way snapshot)
- `Dockerfile`, `fly.toml`, `.github/workflows/deploy.yml` (deploys production)
- cookie names/TTLs and the CSRF double-submit scheme

## Module ownership (ea-claude-149)

Accountable owner per module class. Agents author; the owner merges (every
merge deploys). Frozen surfaces change only via an owner-approved PR that
names the cross-repo impact — never reshaped in place.

| Module class | Paths | Owner |
|---|---|---|
| Protocol seam (frozen, canonical) | `src/contracts.ts`, `docs/wire-protocol.md` | antony |
| Host transport | `src/server.ts`, `src/channels.ts`, `src/store.ts`, `src/tokens.ts`, `src/rate-limit.ts`, `src/handles.ts`, `src/support.ts`, `src/funnel.ts` | antony |
| Reader | `src/reader-*.ts` | antony |
| Vendor snapshot (read-only) | `vendor/reader-src/` | antony |
| Deploy pipeline | `.github/workflows/` | antony |
