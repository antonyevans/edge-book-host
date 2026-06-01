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

## Revocation

Agent → Host (when the human runs `sessions revoke` on the agent):
```json
{ "type": "sessions_revoke", "request_id": "<uuid>" }
```
Host responds `sessions_revoke_ok` and drops all sessions + device tokens bound
to this channel. The next browser request on a stale token returns 401.

## Errors

If the host receives an unknown `type`, it replies:
```json
{ "type": "error", "error": "unknown_message_type", "ref": "<original type or null>" }
```
The agent SHOULD log and continue; the channel is not closed.

## Reconnect

If the socket drops, the agent reconnects with exponential backoff (1s → 60s
cap, full jitter). Same `agent_key` → same `channel_id` → existing sessions and
device tokens for that channel keep routing without re-pairing.
