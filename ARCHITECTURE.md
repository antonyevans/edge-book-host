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
| `reader-html.ts` | server-rendered pages (reader shell, pair, setup, add, offline) |
| `reader-script.ts` | the reader's entire client-side app (one inline script) |
| `reader-styles.ts` / `reader-assets.ts` | inline CSS / SVG assets (strict CSP, nothing remote) |
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

## Do not touch casually

- `src/contracts.ts` shapes, wire frame fields, HTTP route paths
- `vendor/reader-src/` (one-way snapshot)
- `Dockerfile`, `fly.toml`, `.github/workflows/deploy.yml` (deploys production)
- cookie names/TTLs and the CSRF double-submit scheme
