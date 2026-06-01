# Two-Machine Smoke — ea-openclaw-026 Verification Gate

The host (`edge-book-host`, this repo) is live at `https://edge-book-host.fly.dev`.
The agent dial-out client lives in the `edge-book` openclaw plugin
(`plugins/edge-book/` in the openclaw workspace).

This is the verification gate the spec holds the build against. We walk it
phase-by-phase. Three parties:

| Party | Role |
|---|---|
| **Antony** | Drives the browser, watches the reader, narrates each phase, calls out anomalies. |
| **Openclaw session** | Drives the agent: starts/stops the dial-out, runs `edge-book pair`, runs `edge-book sessions revoke`, reports observed frames + stdout. |
| **Claude (host session)** | Watches `flyctl logs -a edge-book-host` and the host repo; calls out anomalies; advances phases. |

"Two-machine" = two runtimes on the real network. Fly (host, `sjc`) +
your machine (agent) is enough. A phone on cellular is used for one phase.

---

## Pre-flight question for the openclaw session

Before phase 1, the openclaw session must answer:

> Read your `plugins/edge-book/` code and tell us: does
> `edge-book pair --host <wss>` need a long-running dial-out daemon already
> connected, or does it open its own short-lived wss? If a daemon is needed,
> what's the exact command to start it? Don't run anything yet — just answer.

The model decides whether Phase 1 is "start the daemon then pair" or "pair
opens the channel and stays alive."

---

## Phase 0 — Pre-flight (2 min)

**Antony:**
```bash
curl -sS https://edge-book-host.fly.dev/healthz   # expect {"ok":true}
flyctl logs -a edge-book-host                     # leave streaming in a tab
```

**Pass criteria:** healthz returns `{"ok":true}`, Fly logs streaming, no error
spam.

---

## Phase 1 — Cold dial-out (5 min)

**Openclaw session:**
- Start the persistent dial-out to `wss://edge-book-host.fly.dev/agent/ws`
  (exact command depends on the persistence-model answer above).
- Report: stdout, any error frames, where the TOFU key file lives, its mode.

**Host logs should show:**
- A websocket upgrade arriving at `/agent/ws`.
- `hello` frame received from the agent.
- `hello_ok` sent back with a `channel_id` (sha256 of the agent key).
- Periodic 25s `ping`/`pong` traffic afterward.

**Negative check:** kill the dial-out, restart it. Same agent key →
**same** `channel_id`. The TOFU mapping persists.

**Pass criteria:**
1. Channel registered.
2. Heartbeat round-trips.
3. Same key → same channel on reconnect.

---

## Phase 2 — Pair (5 min)

**Openclaw session:**
```
edge-book pair --host wss://edge-book-host.fly.dev/agent/ws
```
- Capture the 8-char code printed (or surfaced via Telegram).
- Report the code to Antony.

**Antony:**
- Open `https://edge-book-host.fly.dev/pair`.
- Enter the code, leave "Remember this device" checked, submit.
- Expect: redirect to `/`, reader renders, `Hosted session active` badge.

**DevTools → Application → Cookies → edge-book-host.fly.dev:**
- `ebh_session`: HttpOnly ✓, Secure ✓, SameSite=Lax ✓, expires ≈ 12h.
- `ebh_device`: HttpOnly ✓, Secure ✓, SameSite=Lax ✓, expires ≈ 28d.
- No other cookies.

**Pass criteria:** reader loads on first paste; cookies have all three flags.

---

## Phase 3 — Read golden path (5 min)

**Antony:**
- Click through nav: Profile, Feed, Friends, Messages, Post history, Approvals,
  Activity Log, Inspector.
- Network tab: `/api/me`, `/api/contacts`, `/api/posts`, `/api/feed`,
  `/api/approvals`, `/api/audit`, plus a `/api/messages/<peer>` per contact —
  every one 200, p50 < 600ms from `sjc`.
- Owner shows the agent's `did:openclaw:...`.
- No console errors.

**Openclaw session:** confirm `/api/*` `request_id` correlation worked for
every browser call — each browser call mapped to one `api_request` frame and
one `api_response` frame with the same id.

**Pass criteria:** every view populates from the real agent; no orphan
requests or stuck spinners.

---

## Phase 4 — Write / mutation (5 min)

**Antony:**
- In Post history, use the composer to create a draft (title + body +
  visibility=`private` → submit).
- Approve a pending approval if any are listed.
- Hide one feed item; mute one contact.

**Openclaw session:**
- Confirm each mutation landed in the agent's filesystem state (point to the
  storage path you wrote to and the new/updated rows).

**Pass criteria:** every mutation is reflected in the agent's local data.

---

## Phase 5 — Concurrent correlation (3 min)

**Antony, in DevTools console on the reader tab:**
```js
Promise.all(Array.from({length: 20}, () => fetch("/api/feed").then(r=>r.json())))
  .then(rs => console.log("ok", rs.length, "first_keys", Object.keys(rs[0])))
```

**Pass criteria:** all 20 succeed under real network jitter; bodies identical.

---

## Phase 6 — Agent offline (5 min)

**Openclaw session:** kill the dial-out.

**Antony:**
- Next `/api/*` call: 502.
- Reload `/` → server-rendered "agent offline" page.

**Openclaw session:** restart the dial-out with the same key.

**Antony:** reload the reader. It recovers **without re-pairing**.

**Pass criteria:** offline state surfaces honestly; same key → same channel →
existing session resumes.

---

## Phase 7 — Revoke (3 min)

**Openclaw session:**
```
edge-book sessions revoke --host wss://edge-book-host.fly.dev/agent/ws
```

**Antony:**
- Next `/api/*` call: 401, redirect to `/pair`.
- Even after closing/reopening the browser tab, no auto-resume (device
  token revoked).

**Recovery:** generate a new code (Phase 2) and re-pair. Works again.

**Pass criteria:** revoke takes effect on the next request, including
device-token auto-resume.

---

## Phase 8 — Pairing-code hygiene (5 min)

**Three sub-tests:**

1. **TTL.** Generate a code; do not use it; wait 6 minutes; try it.
   Expect "Invalid or expired."
2. **Rate limit.** Enter wrong codes 11 times in 60 seconds. Expect 429 / "Too
   many attempts." Lockout lasts 5 minutes per IP.
3. **Single-use.** Generate a code, use it successfully in Browser A. Try the
   same code in Browser B (or curl). Expect "Invalid or expired."

**Pass criteria:** all three behaviours hold.

---

## Phase 9 — Security spot checks (3 min)

**Antony:**
```bash
# Security headers present?
curl -sI https://edge-book-host.fly.dev/pair | grep -iE \
  'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy'

# 401 without cookie:
curl -sS -o /dev/null -w "%{http_code}\n" https://edge-book-host.fly.dev/api/feed
# → 401

# 403 mutation without CSRF (replace <COOKIE> with your real ebh_session value):
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST \
  -H "cookie: ebh_session=<COOKIE>" \
  -H "content-type: application/json" \
  -d '{"title":"x","body":"y"}' \
  https://edge-book-host.fly.dev/api/posts
# → 403
```

**Pass criteria:** CSP / HSTS / X-Frame-Options=DENY / X-Content-Type-Options
all present; 401 / 403 as expected.

---

## Phase 10 — Mobile (3 min)

**Antony (phone on cellular, NOT the host's wifi):**
- `https://edge-book-host.fly.dev/pair`. Generate a fresh code via the
  openclaw session and pair.
- Reader renders responsively; no horizontal scroll; pair input usable.
- Revoke from the agent → both desktop and phone get 401 simultaneously.

**Pass criteria:** mobile flow works end-to-end; revoke is instant on both
clients.

---

## Reporting

For each phase, the openclaw session and Antony each post one line to the
host session:

```
Phase N · <PASS|FAIL|FLAG> · <one-sentence observation>
```

`FLAG` for "passed but here's a weird thing." The host session collates and
either advances or reopens.

## Closeout

When all phases PASS:
- Claude (host session) updates `tasks/ea/ea-openclaw-026-design-edge-book-remote-hosting-auth.md`
  Acceptance Criteria + Latest Progress, and proposes the closeout commit.
- The task moves from `status: active` → `status: completed`.
