# Edge Book Host Observability (ea-claude-089) — Host-side Plan

**Goal:** Expose basic ops metrics from `edge-book-host` so a monitor can answer: is the host up, how many agents are connected, is the mailbox draining, are deliveries succeeding. (The Slack alerting cron lives separately in the EA harness; this plan is the host endpoint + counters it consumes.)

**Architecture:** Add an unauthenticated, non-sensitive `/metrics` endpoint (counts only — no agent ids, no blobs) alongside the existing `/healthz` in `src/server.ts`. Back it with a live-channel count on `ChannelRegistry` and cumulative in-memory delivery counters incremented where the existing `logEvent` mailbox events already fire. Counters are process-lifetime (reset on restart) — that's fine; the monitor tracks deltas/uptime.

**Gates (host repo):** `npm run typecheck` (tsc), `npm test` (tsx --test), `npm run build`. Baseline 56/56.

**Anchors:** `/healthz` at `src/server.ts:375`; `ChannelRegistry` (`src/channels.ts` — `has`, `connectionCount`, mailbox enqueue logEvent ~`:273`, ack reject ~`:289`, `deliverQueued`/`flushMailbox`); `store.mailboxCount()` (`src/store.ts:171`); `store.state.channels` map.

---

## Task 1: live-channel count + delivery counters on ChannelRegistry (TDD)

**Files:** `src/channels.ts`; `test/observability.test.ts` (new)

- [ ] **Step 1: Failing test** — create `test/observability.test.ts`. Construct a `ChannelRegistry` over a fresh `HostStore` (copy the construction pattern from `test/integration.test.ts` / `test/mailbox.test.ts`). Assert:
  - a new registry reports `liveChannelCount() === 0` and `metrics()` counters all 0;
  - after enqueuing a mailbox message (via the same path the existing mailbox test uses), the `enqueued` counter increments and `store.mailboxCount()` reflects the queued depth.
  (Match the real enqueue entrypoint used in `test/mailbox.test.ts` — do not invent one.)

- [ ] **Step 2:** Run `npm test` (or `tsx --test test/observability.test.ts`) → FAIL (`liveChannelCount`/`metrics` undefined).

- [ ] **Step 3: Implement** on `ChannelRegistry`:
  - Private counters object: `{ enqueued: 0, delivered: 0, acked: 0, errors: 0 }`.
  - Increment at the existing event sites: `enqueued` where `mailbox_enqueue` logs; `delivered` where messages are pushed to a socket in `deliverQueued`/`flushMailbox`; `acked` where an ack deletes a message; `errors` where `mailbox_ack_reject` (or a delivery failure) logs. Reuse the exact spots that already `logEvent(...)` so counting and logging stay in lockstep.
  - `liveChannelCount(): number` — number of channels with ≥1 live connection (iterate the internal channels map; reuse `connectionCount` logic).
  - `metrics(): { connected_channels, mailbox_queue_depth, deliveries: {...counters} }` — pulls `liveChannelCount()`, `this.store.mailboxCount()`, and the counters.

- [ ] **Step 4:** Run → PASS; `npm run typecheck`; `npm test` full 56+new green. Commit: `feat(obs): live-channel count + mailbox delivery counters on ChannelRegistry`

## Task 2: `/metrics` endpoint (TDD)

**Files:** `src/server.ts`; `test/observability.test.ts` (append)

- [ ] **Step 1: Failing test** — append an HTTP-level test mirroring how `test/integration.test.ts` starts the server and issues requests. Hit `GET /metrics` (no auth) and assert 200 + JSON shape `{ ok: true, connected_channels: number, mailbox_queue_depth: number, deliveries: { enqueued, delivered, acked, errors }, uptime_s: number }`. Assert it does NOT leak any channel_id/agent_key/blob (counts only).

- [ ] **Step 2:** Run → FAIL (404).

- [ ] **Step 3: Implement** — add right after the `/healthz` block (`src/server.ts:378`, BEFORE the session check so it's unauthenticated):

```typescript
    if (url.pathname === "/metrics") {
      const m = channels.metrics();
      sendJson(res, 200, {
        ok: true,
        connected_channels: m.connected_channels,
        mailbox_queue_depth: m.mailbox_queue_depth,
        deliveries: m.deliveries,
        uptime_s: Math.round(process.uptime()),
      });
      return;
    }
```

- [ ] **Step 4:** Run → PASS; `npm run typecheck`; `npm test` green; `npm run build`. Commit: `feat(obs): unauthenticated /metrics endpoint (counts only)`

## Task 3: extend `/healthz` with a one-line liveness summary (optional, tiny)

**Files:** `src/server.ts`

- [ ] **Step 1:** Keep `/healthz` returning 200 `{ ok: true }` (don't break the existing fly check / 084), but add `connected_channels` and `mailbox_queue_depth` to its body so a single cheap probe carries the headline numbers. Update any health test if present.
- [ ] **Step 2:** `npm run typecheck` + `npm test` + build green. Commit: `feat(obs): include connected/queue summary in /healthz body`

---

## Deploy
After merge to `main`: `flyctl deploy` from `~/claude/edge-book-host` (the existing fly app `edge-book-host`). Verify `curl https://edge-book-host.fly.dev/metrics` returns the JSON. (The `/healthz` fly check from 084 keeps working — body changed, status unchanged.)

## Self-Review
- Spec coverage (089 host side): connected-agent count ✓, mailbox delivery counters ✓, queue depth ✓, exposed for ops ✓. Alerting cron is the EA-harness half (separate).
- Safety: `/metrics` is counts-only, unauthenticated by design (like `/healthz`); no channel ids, agent keys, or blob contents. Confirm in Task 2's test.
- Counters are process-lifetime (documented); the monitor derives rates/deltas and uses `uptime_s` to detect restarts.
