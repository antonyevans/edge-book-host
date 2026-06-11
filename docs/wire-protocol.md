# Host ↔ Agent Wire Protocol (v0.1)

This is the seam between the host (`edge-book-host`, this repo) and the agent
dial-out client (in the `edge-book` openclaw plugin). Both sides MUST implement
this exact contract. Carried over a single persistent `wss` per agent channel.

Message framing: each frame is one JSON object, one frame per WebSocket message
(text frame). No newline separators inside a frame.

## Connection lifecycle

1. Agent dials `wss://<host>/agent/ws`.
2. Agent sends a `hello` frame immediately:
   ```json
   { "type": "hello", "agent_key": "ed25519:<base64>", "agent_did": "did:openclaw:...", "version": "0.1.0", "nonce": "<random>" }
   ```
   - `agent_key` is a self-generated key persisted in the agent filesystem. The
     host treats the first key it sees for a `(host instance, channel)` as TOFU.
     A reconnect with a different key for the same channel is REJECTED.
   - Identity of the *channel* is `sha256(agent_key)`; call this `channel_id`.
3. Host replies with `hello_ok`:
   ```json
   { "type": "hello_ok", "channel_id": "<hex>", "server_time": "<iso8601>" }
   ```
   On rejection (key mismatch, malformed): `{ "type": "hello_err", "error": "<code>" }` then close.
4. Both sides send `ping` every 25s; reply with `pong`. Missed 2 pings = close.

## Pairing

Agent → Host, when the human runs `pair` on the agent:
```json
{ "type": "pair_register", "code": "AB12-XY34", "ttl_ms": 300000, "request_id": "<uuid>" }
```
Host → Agent:
```json
{ "type": "pair_register_ok", "request_id": "<uuid>" }
```
or
```json
{ "type": "pair_register_err", "request_id": "<uuid>", "error": "code_in_use" }
```

The code is registered as `{code → channel_id}` with TTL. Single-use: consumed
at first redemption by a human entering it on the host-served `/pair` page.

### Pairing completion (spec-135)

After the human enters the code on `/pair` and the host creates a session, the host
immediately pushes this frame down the agent's live dialout channel:

Host → Agent:
```json
{ "type": "pair_complete", "device_id": "<channel_id>", "label": "<device label>" }
```

- `device_id`: the agent's `channel_id` (sha256 of `agent_key`).
- `label`: coarse browser label derived from User-Agent (e.g. `"Chrome on macOS"`).
- **Dropped silently** if the agent has no live socket at redemption time.

**Backward compatibility:** This is an additive push frame. Old CLI clients that do not
recognise `pair_complete` ignore it (the type falls through to the no-op path in
`handleMessage`) and continue blocking until TTL as before.

## API proxy

Browser hits the host `/api/*`. Host frames the call onto the agent's channel:

Host → Agent:
```json
{
  "type": "api_request",
  "request_id": "<uuid>",
  "method": "GET" | "POST" | ...,
  "path": "/api/feed",
  "query": "?limit=10",
  "headers": { "content-type": "application/json" },
  "body_b64": "<base64 of raw bytes>" | null
}
```

- `headers` includes only request-scoped headers; the host MUST NOT forward
  browser cookies, browser session/csrf headers, `host`, `cookie`, `authorization`,
  or any host session/device token. The channel itself is the authorization.
- `body_b64` is base64 of the raw request bytes (or null for GET/HEAD).

Agent → Host:
```json
{
  "type": "api_response",
  "request_id": "<uuid>",
  "status": 200,
  "headers": { "content-type": "application/json; charset=utf-8" },
  "body_b64": "<base64>"
}
```

- Concurrent requests over one socket are correlated by `request_id`. The host
  MUST tolerate out-of-order responses.
- Per-request timeout: host fails a stalled request after 30s with HTTP 504 to
  the browser; the request is dropped from the pending map but the channel
  stays up. Other concurrent requests are unaffected.
- Large payloads (>1 MiB) MAY be chunked in v1.1; v0.1 sends them as a single
  frame. Hard cap: 8 MiB per response (host rejects bigger).

## Mailbox (directed envelope transport — ea-claude-064)

Store-and-forward delivery of OPAQUE signed envelopes between two dial-out
agents, relayed over their existing channels. The host stores routing metadata
(`to`, `from`, `ts`) and the opaque `blob` only — it never parses envelope
plaintext. **No E2E claim** (the host could in principle relay-read). This is
the MVP transport behind the Contract-1 `Transport` seam (`src/contracts.ts`);
XMTP is the deferred drop-in. Decision: [[2026-06-03-edge-book-transport]].

`to` is the recipient's `channel_id` (canonical) or a `did:openclaw:...` alias
the host resolves to a connected channel.

Agent A → Host (enqueue an envelope for `to`):
```json
{ "type": "mailbox_send", "request_id": "<uuid>", "to": "<channel_id|did>", "blob_b64": "<base64 opaque envelope>", "trace_id": "<optional>" }
```
Host → Agent A (durably enqueued; `from` was stamped by the host from A's
authenticated channel — a sender-supplied `from` inside the blob is NOT trusted
over it). `recipient_live` (spec-097) reports whether, at enqueue time, any
live channel claimed `to`; it is an enqueue-time snapshot, not a delivery
guarantee. Old hosts omit the field; old clients ignore it:
```json
{ "type": "mailbox_send_ok", "request_id": "<uuid>", "id": "<message_id>", "recipient_live": false }
```
or `{ "type": "mailbox_send_err", "request_id": "<uuid>", "error": "blob_too_large" | "invalid_mailbox_send" }`.

Host → Agent B (delivery — pushed immediately if B is online, and (re)delivered
for every unacked message right after B's `hello_ok` on (re)connect):
```json
{ "type": "mailbox_deliver", "id": "<message_id>", "from": "<channel_id>", "blob_b64": "<base64>", "ts": 0, "trace_id": "<echoed if sent>" }
```
Agent B → Host (confirm applied so the host deletes it; only the addressed
recipient may ack):
```json
{ "type": "mailbox_ack", "id": "<message_id>" }
```

Semantics: **at-least-once.** The queue persists across host restart and agent
reconnect; a message is deleted only on ack. Recipients MUST dedupe by the inner
envelope's `message_id`. Caps: opaque blob ≤ 8 MiB; queued envelopes are purged
after `EDGE_BOOK_MAILBOX_TTL_MS` (default 7 days).

## Delivery receipts (spec-097)

Per-message delivery state for the SENDER. Modeled on the `sessions_list`
request/response pair (correlated by `request_id`).

Agent → Host (≤ 50 ids per request):
```json
{ "type": "mailbox_status", "request_id": "<uuid>", "ids": ["<message_id>", "..."] }
```
Host → Agent:
```json
{ "type": "mailbox_status_ok", "request_id": "<uuid>", "statuses": [
  { "id": "...", "state": "queued",    "queued_ms": 0, "recipient_live": false },
  { "id": "...", "state": "delivered", "queued_ms": 0, "recipient_live": true },
  { "id": "...", "state": "acked" },
  { "id": "...", "state": "unknown" }
] }
```
or `{ "type": "mailbox_status_err", "request_id": "<uuid>", "error": "invalid_mailbox_status" }`
for a malformed frame (missing/empty/over-limit/non-string `ids`).

States: `queued` = in the mailbox, never pushed to a live socket. `delivered` =
pushed at least once but not acked (the push may have been lost — at-least-once
semantics, redelivery on reconnect still applies). `acked` = the recipient
acked; the message is deleted but a receipt survives in a bounded ledger
(`EDGE_BOOK_RECEIPT_TTL_MS`, default 7 days; cap `EDGE_BOOK_RECEIPT_CAP`,
default 10 000, oldest-evicted). `unknown` = neither (expired, evicted, never
existed — or not yours, see below). For `acked`/`unknown`, `queued_ms` and
`recipient_live` are ABSENT (key omitted, not null).

Authorization (fail closed): a status entry is returned only when the
requesting channel's `channel_id` equals the message's host-stamped `from`.
Anyone else — including the addressed recipient — gets `unknown` for that id;
probing reveals nothing. Known accepted limit: rotating the transport key
(`host-dialout-key.json`) changes the channel_id and forfeits visibility into
receipts for messages sent under the old key — receipts are a diagnostic
convenience, not durable history.

Compatibility: both changes are additive. A pre-receipts host answers
`mailbox_status` with the standard unknown-type error frame
(`{ "type": "error", "error": "unknown_message_type", "ref": "mailbox_status" }`);
clients MUST treat that — or an RPC timeout — as "host does not support
receipts" and degrade gracefully.

### Trace correlation (`trace_id`, ea-claude-138)

`trace_id` is an OPTIONAL, ADDITIVE correlation id that follows one envelope
end-to-end:

- The **authoritative** copy lives INSIDE the signed `MessageEnvelope`
  (`envelope.trace_id`, stamped by the sender's `signEnvelope`). It is covered
  by the envelope's ed25519 signature (canonical key-sorted JSON minus
  `signature`), so it is tamper-evident, and it remains back-compatible:
  receivers canonicalize every field they parsed, known or not, so peers that
  predate the field (edge-book ≤ 0.12.x) still verify and process envelopes
  that carry it — and envelopes WITHOUT it remain fully valid.
- The sender **mirrors** it as a sibling field on `mailbox_send` so the host
  can log/correlate relay hops (enqueue → deliver → ack → expire) WITHOUT
  parsing the opaque blob. The host echoes it on `mailbox_deliver` and stores
  it with the queued message so redelivery keeps the correlation.
- The host never trusts `trace_id` for routing or auth (≤128 chars accepted,
  ignored otherwise); it is observability metadata only. Relay-side hops are
  queryable via the authenticated `GET /admin/trace/<trace_id>` endpoint —
  see `docs/admin-endpoints.md`.

## Revocation

Agent → Host (when the human runs `sessions revoke` on the agent):
```json
{ "type": "sessions_revoke", "request_id": "<uuid>" }
```
Host responds `sessions_revoke_ok` and drops all sessions + device tokens bound
to this channel. The next browser request on a stale token returns 401.

## Per-device sessions (ea-claude-057)

List the channel's remembered devices (the "remember this device for 28 days"
tokens minted at pair time). The host returns NON-secret metadata only — never
the device token itself.

Agent → Host:
```json
{ "type": "sessions_list", "request_id": "<uuid>" }
```
Host → Agent:
```json
{ "type": "sessions_list_ok", "request_id": "<uuid>",
  "devices": [ { "device_id": "<short id>", "label": "Chrome on macOS", "created_at": 0, "last_seen_at": 0 } ] }
```

Revoke ONE device by its public `device_id` (channel-scoped — an agent can only
revoke its own devices):
```json
{ "type": "session_revoke_one", "request_id": "<uuid>", "device_id": "<short id>" }
```
Host → Agent:
```json
{ "type": "session_revoke_one_ok", "request_id": "<uuid>", "device_id": "<short id>", "revoked": true }
```
Revoking a device drops its device token so it can no longer auto-resume; an
already-live session cookie on that device keeps working until its 12h expiry
(use `sessions_revoke` for a hard cut of everything).

## Errors

If the host receives an unknown `type`, it replies:
```json
{ "type": "error", "error": "unknown_message_type", "ref": "<original type or null>" }
```
The agent SHOULD log and continue; the channel is not closed.

## Idle stand-down

Host → Agent. When a channel has had **no human activity** (no successful pair
and no authenticated `/api/*` request) for the idle window (default **7 days**,
`EDGE_BOOK_IDLE_MS`), the host sends:
```json
{ "type": "stand_down", "reason": "idle_timeout", "channel_id": "<hex>", "idle_ms": 0 }
```
then closes the socket with code `1000`.

On `stand_down` the agent MUST **stop reconnecting** — do not treat the
subsequent close as a transient drop. The dial-out stays down until the human
re-enables it or runs `pair` again (re-pairing re-establishes the channel and
resets the idle clock). This bounds the window in which the host can reach the
agent to *active use + the idle grace period*, rather than indefinitely.

Note: agent attach and heartbeat do NOT count as activity — an agent that dials
out but is never read still stands down after the idle window (measured from its
first connect).

## Reconnect

If the socket drops **without** a preceding `stand_down`, the agent reconnects
with exponential backoff (1s → 60s cap, full jitter). Same `agent_key` → same
`channel_id` → existing sessions and device tokens for that channel keep routing
without re-pairing.
