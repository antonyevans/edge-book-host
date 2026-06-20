# Host Admin / Observability Endpoints (ea-claude-138)

Authenticated, read-only operational endpoints on the relay host, plus the
structured logging that backs them. Implementation: `src/admin.ts`,
`src/observe.ts`.

## Authentication — fail closed

- Token comes from the `ADMIN_TOKEN` environment variable (set it as a Fly
  secret: `fly secrets set ADMIN_TOKEN=...`). It is read per request, so
  rotation needs no redeploy of code.
- **`ADMIN_TOKEN` unset/empty → every `/admin/*` path returns 404**, exactly
  like any unknown route. The surface does not exist unless explicitly
  enabled.
- Requests authenticate with `Authorization: Bearer <token>`. Missing/wrong
  token → 401. Comparison is constant-time (`timingSafeEqual`).
- GET only; other methods → 405.

## Endpoints

### `GET /admin/agents`

Per-agent (channel) summary: mailbox queue depth and last-seen dial-out.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/admin/agents
```

```json
{
  "ok": true,
  "agents": [
    {
      "channel_id": "<sha256 hex>",
      "agent_did": "did:openclaw:..." ,
      "connected": true,
      "mailbox_depth": 2,
      "last_seen_at": 1760000000000,
      "first_seen_at": 1750000000000,
      "last_active_at": 1759990000000
    }
  ]
}
```

- `last_seen_at` — last dial-out attach (agent connectivity).
- `last_active_at` — last HUMAN activity (pair / authed `/api/*`); absent if
  never.
- `mailbox_depth` counts unexpired queued messages addressed to the channel
  (by `channel_id` or DID alias).

### `GET /admin/trace/<trace_id>`

Relay-side hops recorded for one envelope trace (see
`docs/wire-protocol.md` § Trace correlation).

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/admin/trace/trace_abc123
```

```json
{
  "ok": true,
  "trace_id": "trace_abc123",
  "hops": [
    { "trace_id": "trace_abc123", "hop": "enqueue", "id": "<mailbox id>", "from": "<12-char ref>", "to": "<12-char ref>", "ts": 1760000000000 },
    { "trace_id": "trace_abc123", "hop": "deliver", "id": "<mailbox id>", "from": "<12-char ref>", "to": "<12-char ref>", "ts": 1760000000050 },
    { "trace_id": "trace_abc123", "hop": "ack",     "id": "<mailbox id>", "to": "<12-char ref>", "ts": 1760000000120 }
  ]
}
```

- Hops: `enqueue` → `deliver` (one per delivery attempt, including
  redelivery-on-reconnect) → `ack`, plus `expire` for TTL purges.
- The "support reference" printed by `edge-book doctor --send` (spec-134) is a
  trace_id — paste it here to see whether the user's bundle reached the
  support mailbox.
- Backed by a bounded in-memory ring (1000 hops); restart clears it. Unknown
  trace ids return `hops: []` (200).

## Structured logging

Mailbox operations emit single-line JSON to stdout (visible via `fly logs`):

```json
{"ts":"2026-06-10T12:00:00.000Z","event":"mailbox_enqueue","id":"<mailbox id>","to":"<12-char ref>","from":"<12-char ref>","trace_id":"trace_abc123"}
```

Events: `mailbox_enqueue`, `mailbox_deliver` (per message, covers
redelivery), `mailbox_ack`, `mailbox_ack_reject`, `mailbox_expire`.
`trace_id` is present when the sender supplied one.

Privacy: log lines and admin responses carry routing metadata only —
truncated channel refs, host message ids, timestamps, trace ids. Never
message blobs, envelope plaintext (opaque to the host by design), tokens, or
cookies.

## Village Werewolf demo (`/werewolf`)

Live event surface (`src/werewolf.ts`). The game itself runs on an operator
machine and PUSHes state snapshots here; the host is display + relay only.

- `GET /werewolf` — public projector + join page (polls the events endpoint).
- `GET /werewolf/events` — public read of the current snapshot.
- `POST /werewolf/events` — operator push, `Authorization: Bearer $ADMIN_TOKEN`
  (same token + fail-closed-404-when-unset rules as `/admin/*`). Body is the
  snapshot `{ events, lobby, phase, status, round }`; 512 KB cap.
- `POST /werewolf/reset` — admin-gated; clears the snapshot back to LOBBY.

Env var: `WEREWOLF_NARRATOR_HANDLE` sets the handle shown in the join
instructions (default `eddingham`). Set as a Fly secret to match the live
Narrator agent: `fly secrets set WEREWOLF_NARRATOR_HANDLE=<handle>`.
