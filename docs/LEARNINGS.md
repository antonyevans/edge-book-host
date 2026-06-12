# LEARNINGS — edge-book-host

_Last gardening pass: 2026-06-11_

Actionable lessons from incidents, refactors, and design episodes: what future
sessions should do differently. Complements `FINDINGS.md` (grandfathered
exceptions, tool evaluations, the `## Reversions` log — facts: date/PR/cause)
and the design docs in `docs/` (intent). No duplication: an entry may cite a
FINDINGS entry or spec, never restate it. **Two-strikes rule:** first
occurrence of a lesson = an entry here; second occurrence = promote it to a
formal rule in `CLAUDE.md` and mark the entry superseded. Keep this file under
~100 lines of entries; the monthly gardening pass (spec-0038) prunes it.

### 2026-06-03 — Defer the "right" dependency behind a seam, not a rewrite

**Trigger:** decision 2026-06-03-edge-book-transport (EA repo,
`04-decisions/made/`).
**Observation:** XMTP was the ecosystem-aligned transport but failed the
"stable and built" bar (Node ≥22 vs Hermes Node 20; Alpha MLS bindings;
mid-decentralisation forced migration). Instead of adopting early or rewriting
later, the host-relayed mailbox shipped behind the `Transport` interface in
`src/contracts.ts` — `send`/`receive`/`ack` over opaque blobs — so an
`XmtpTransport` can drop in without touching anything above the seam. The
header records explicit re-evaluation triggers rather than a vague "later".
**Action:** When deferring a strategically-preferred dependency, define the
interface seam first and write dated re-evaluation triggers into the canonical
file; do NOT pre-build the deferred implementation. State honest limits at the
seam (no E2E privacy claim — the host could relay-read) instead of implying
guarantees the MVP doesn't have.
**Confidence:** high
**Status:** active

### 2026-06-03 — One canonical contract file, split authorship, no forked models

**Trigger:** ea-claude-063 (Phase 0 GATE) — `src/contracts.ts` header.
**Observation:** The cross-repo seam was kept coherent by making this file the
single canonical definition with explicit division of authorship: Contract 1
(transport seam) led by the host, Contract 2 (object/grant/audit) led by the
CLI side but drafted here as the shared shape, with a hard "do NOT fork a
parallel data model" instruction mapping onto the existing capability-grant /
message-envelope model. The CLI reconciles its mirrored types against this
file by spec, not by import.
**Action:** For any new cross-repo type, extend `src/contracts.ts` (additively
— see frozen surfaces in CLAUDE.md) and name a lead per contract in the header
comment. Never let the consuming repo invent its own shape first and reconcile
later. (But see 2026-06-11 below: canonical-by-convention alone was not
enough.)
**Confidence:** high
**Status:** active

### 2026-06-09 — Instrumentation deferred is debugging over Telegram

**Trigger:** ea-claude-089 host observability (docs/2026-06-09-host-observability-plan.md)
+ decision 2026-06-10-edge-book-debug-harness (EA repo).
**Observation:** Ops metrics and tracing were deliberately deferred through the
MVP build. The cost surfaced as soon as real users hit friend-connection bugs:
evidence was split across three machines we can't see, so debugging meant
interrogating users over Telegram. The fix wave (counters at the existing
`logEvent` sites in `src/channels.ts`, `/metrics` next to `/healthz` in
`src/server.ts`, then trace_id + `/admin/agents` + `/admin/trace/<id>` in
ea-claude-138) was cheap precisely because it reused existing event sites —
and trace IDs landed *before* the messaging milestone so send/receive was born
traceable. Full payoff arc (doctor, event log, record-replay: 137/138/141) is
in edge-book-cli `docs/LEARNINGS.md`.
**Action:** New protocol surfaces increment counters/logs at the same
`logEvent` call sites in the same PR — counting and logging stay in lockstep.
Land trace/observability hooks before a milestone starts, not after the first
user bug report.
**Confidence:** high
**Status:** active

### 2026-06-09 — God file → size gates enforced by an exit-2 hook

**Trigger:** refactor PRs #3 (llm-legibility), #5 (llm-hygiene-gates),
#6 (size-compliance).
**Observation:** `src/reader-html.ts` accreted styles, inline SVGs, and the
client script until PR #3 had to extract `reader-styles.ts`,
`reader-assets.ts`, and `reader-script.ts`. PR #5 then installed the gates:
`max-lines: 500` (error) in `eslint.config.mjs` plus the PostToolUse hook
`.claude/hooks/lint-edited-file.mjs`, which exits 2 on violation so the agent
sees the lint output and self-corrects in-session (exit 1 would NOT block).
PR #6 paid down the grandfathered `eslint-disable max-lines` comments by
splitting the remaining oversized files — disables proved to be deferred work,
not exceptions.
**Action:** Don't let generated-markup modules grow in place — split per the
DESIGN.md routing table at the first lint error. When adding agent-enforced
gates, use the exit-2 PostToolUse hook pattern (it is proven here); treat any
`eslint-disable max-lines` as a debt item with a follow-up extraction task.
**Confidence:** high
**Status:** active

### 2026-06-11 — Canonical contract files rot unless a generator/CI check pins them

**Trigger:** ea-claude-152 (wire-frame schemas, host PR #15) — pre-work drift
finding.
**Observation:** `src/contracts.ts` had silently drifted from wire reality:
`recipient_live` (spec-097), the entire `mailbox_status` frame family, and
`discoverable` (spec-096) were emitted/read by `src/channels.ts` but absent
from the canonical file. "Canonical by convention" (see the 2026-06-03 entry
above) held shape discipline but not completeness — nothing failed when a
frame was added without updating contracts.ts. Now pinned mechanically:
`schemas/wire-frames.schema.json` is generated from contracts.ts
(`npm run schemas:check` drift gate), inbound frames are validated fail-closed
(`src/frame-validate.ts`, `frame_invalid` log + metric), and host CI byte-diffs
the CLI's vendored schema copy.
**Action:** Any change to wire frames goes through contracts.ts + regenerating
the schema (`npm run schemas:check` must pass); never add or extend a frame
directly in channels.ts. If you create a new "canonical" artifact anywhere,
ship the generator/CI drift check in the same PR — a canonical file without an
enforcement mechanism is documentation, not a contract.
**Confidence:** high
**Status:** active
