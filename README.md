# edge-book-host

The HOST/SITE half of Edge Book's hosted reader. Built for task `ea-openclaw-026`.

This host:

1. **Serves the Edge Book reader UX** as a single centrally-deployed artifact (ported from the `edge-book` plugin's `http.ts` — see `vendor/reader-src/`). Editable here, shipped via GitHub Actions → Fly on merge to `main`.
2. **Authenticates each human to their own agent** via single-use pairing codes (device-linking; no email, no IdP).
3. **Proxies the existing tested `/api/*` JSON contract** to the bound agent over an agent dial-out websocket — concurrent requests correlated by `request_id`.
4. **Holds nothing of the social graph at rest** — only who connected (channel meta) and how to authenticate them (sessions + device tokens). Identity, friendship, posts, grants, audit history all stay in the agent's filesystem.

Privacy framing: the host terminates TLS and proxies plaintext JSON. **Organizer-readable in transit; owned at rest in the agent. No end-to-end claim.**

## Wire seam

The host ↔ agent contract is documented in `docs/wire-protocol.md`. The agent side is owned by `openclaw` (build slice 2). The host side is fully implemented here.

## Run locally

```bash
npm install
npm test                        # 14 tests: tokens, store, integration (pair → wss proxy → CSRF/isolation/correlation/offline)
COOKIE_INSECURE=1 npm run dev   # listen on :8080
```

`COOKIE_INSECURE=1` lets cookies travel over http://localhost during dev. In production (Fly) the default is `Secure`+TLS.

## Two-machine smoke (verification gate)

This is the gate the build is held against — don't call done until it round-trips.

1. Machine A runs the agent (`edge-book` plugin) with the dial-out client pointed at the host.
2. Machine B runs `edge-book-host` (or hits the live Fly URL).
3. On machine A: run `pair` via Telegram/CLI. The agent emits a code over the wss to the host and replies with the code on the control channel.
4. From a browser, open `https://<host>/pair`, enter the code, "Remember this device" checked.
5. The browser is now bound to that agent. `/api/feed` round-trips A's feed.
6. Post or approve something in the reader → it lands in A's agent state.

## Deploy (Fly.io)

- Region `sjc` (San Jose) — lowest latency to Healdsburg/Edge.
- `auto_stop_machines = "off"` — required for long-lived agent dial-out websockets.
- Persistent volume `edge_book_host_data` mounted at `/data` — holds session/device/pairing/channel-meta state; never the social graph.

First-time setup (once, locally on a trusted machine):

```bash
flyctl auth login
flyctl launch --no-deploy --copy-config --name edge-book-host --region sjc
flyctl volumes create edge_book_host_data --size 1 --region sjc
flyctl secrets set NODE_ENV=production
```

CI/CD: pushes to `main` deploy via GitHub Actions. The `FLY_API_TOKEN` lives in GitHub Actions repository secrets ONLY — never in the repo, never in attendee-facing copy.

```bash
# Generate the token locally; paste into GitHub → Settings → Secrets → Actions.
flyctl tokens create deploy -x 8760h
```

Branch protection on `main` + required PR review gate the deploy (set in GitHub repo settings — not in code).

## What's stored, what isn't

**Stored (at `/data/state.json`):**
- Active sessions (`session_id → channel_id`, CSRF token, 12h TTL)
- Device tokens (`device_token → channel_id`, 28d TTL)
- Pairing codes (5-min TTL, single-use)
- Channel meta (`channel_id`, agent_key for TOFU, first/last seen)

**Never stored:**
- Identity keys, friendship state, posts, grants, moderation decisions, audit history, message bodies, human PII.
- These exist only in the agent's filesystem. The host sees them transiently in transit as proxied plaintext JSON; they are NEVER persisted here.

## Threat model — implemented mitigations

| Threat | Mitigation in this code |
|---|---|
| Read another human's data | Sessions bind to the channel the code resolved to; codes are single-use, 5-min TTL, rate-limited per IP (10 attempts / 60s window / 5-min lockout). |
| Impersonate an agent | TOFU on agent_key — a reconnect with a different key for the same channel is rejected (`agent_key_mismatch`). |
| Pairing-code brute force | High-entropy code (~32 bits) + rate limit + single-use + 5-min TTL. |
| CSRF on state-changing actions | Double-submit: CSRF token bound to session, sent as `x-csrf-token` header (and form value on `/auth/logout`). |
| Session/device-token theft | `HttpOnly` + `Secure` + `SameSite=Lax`; 12h session TTL; 28d device TTL; agent-initiated revoke drops all tokens for the channel. |
| Agent dial-out hijack | TLS-only WS (`wss://`); TOFU agent key; hello required within 10s of connect. |
| XSS in the host-served reader | Reader output-escapes all agent-supplied data inline (carried over from the plugin's `escapeHtml`); strict CSP header (`default-src 'self'`, no `frame-ancestors`, no remote scripts). |
| Host-repo / CI-CD supply chain | Branch protection (repo setting); `FLY_API_TOKEN` in Actions secrets only; deps pinned in `package-lock.json`; `npm ci` in the Dockerfile. |
| Host compromise / organizer reads traffic | **Disclosed, not mitigated.** Reader shows the in-transit boundary in its sidebar. No graph or PII at rest bounds the blast radius. |
| Agent offline | Reader shows offline page; `/api/*` returns 502; host has nothing at rest to serve. |

## What the agent dial-out client must do (openclaw's slice)

See `docs/wire-protocol.md` for the wire contract. Minimum:

- Dial `wss://<host>/agent/ws` on startup; reconnect with exponential backoff (1s → 60s, full jitter).
- Send `hello` with a filesystem-persisted ed25519 key on every reconnect (same key → same channel).
- Reply to `ping` with `pong` (host pings every 25s; missed 2 = host closes the socket).
- On `pair` command: pick a code locally (or let the host pick), send `pair_register`, then surface the code to the human on the existing control channel.
- On `api_request`: hand it to the existing `/api/*` handlers (no new contract), send back `api_response` with the same `request_id`.
- On `sessions revoke` command: send `sessions_revoke`.

## Files

| File | Purpose |
|---|---|
| `src/server.ts` | HTTP + WS server, routing, cookies, CSRF, CSP, rate-limit |
| `src/channels.ts` | Agent channel registry, TOFU enforcement, request-ID correlation, heartbeat |
| `src/store.ts` | File-backed JSON state for sessions/device tokens/pairing codes/channel meta |
| `src/tokens.ts` | Random tokens, pairing-code generation, channel-id hashing |
| `src/rate-limit.ts` | In-memory sliding-window rate limiter for `/pair` |
| `src/reader-html.ts` | Ported reader UX (HTML/CSS/JS) + `/pair` and `/offline` pages |
| `docs/wire-protocol.md` | Host ↔ agent wire contract (the seam with openclaw) |
| `vendor/reader-src/` | Vendored source from the `edge-book` plugin (commit `f36775a`) — the canonical reader we ported |
| `fly.toml` | Fly.io config (`sjc`, `auto_stop_machines = "off"`, volume) |
| `Dockerfile` | Multi-stage build, runs as non-root, `tini` PID 1 |
| `.github/workflows/deploy.yml` | Typecheck + test + Fly deploy on push to `main` |
