// Edge Book MVP — shared contracts (ea-claude-063, Phase 0 GATE).
//
// Governing spec: spec-0020-edge-book-mvp-scope (R2/R3/R6/R7).
// Transport decision: 2026-06-03-edge-book-transport (host-relayed mailbox now,
// XMTP later behind the same Transport seam).
//
// This file is the CANONICAL definition of the two MVP contracts. The host
// (this repo) consumes Contract 1 to relay envelopes and never inspects their
// plaintext. The agent/CLI (openclaw `edge-book` plugin) owns the authority
// pieces of Contract 2 (signing, grant checks, audit) and MUST reconcile its
// types against this file — these map onto the existing capability-grant /
// message-envelope model in `edge-book-agent-network-spec.md`; do NOT fork a
// parallel data model.
//
// Division of authorship (ea-claude-063):
//   * Contract 1 (transport seam)  — lead: claude (host). The host is the
//     convergence point for delivery and the keystone (ea-claude-064/065).
//   * Contract 2 (object/grant/audit) — lead: openclaw (data model lives in the
//     CLI/agent, ea-claude-066). Drafted here as the shared shape; openclaw
//     reconciles signatures/scopes against the plugin's capability-grant store.

// ───────────────────────────────────────────────────────────────────────────
// Contract 1 — Transport adapter + mailbox message
// ───────────────────────────────────────────────────────────────────────────
//
// A directed, store-and-forward envelope transport between two dial-out agents.
// The host relays OPAQUE bytes: it sees routing metadata (`to`, `from`, `ts`)
// and the opaque `blob` only — never the envelope plaintext. No E2E privacy
// claim for the MVP (the host could in principle relay-read); state honestly.
//
// MVP implementation: HostMailboxTransport (host relay over the existing
// dial-out `wss`). Later drop-in (deferred, do NOT build): XmtpTransport. The
// seam is this interface — object/grant/audit code (Contract 2) depends ONLY on
// `Transport`, so swapping the impl changes nothing above it.

/** A recipient address. MVP canonical form is the host `channel_id`
 *  (sha256(agent_key), hex) carried in the pairing card; a `did:openclaw:...`
 *  is accepted as a convenience alias and resolved to a channel by the host. */
export type RecipientAddress = string;

/** Acknowledgement returned by the host when an envelope is durably enqueued. */
export interface Ack {
  /** Host-assigned mailbox message id (echoed in delivery + ack). */
  id: string;
  /** True once the envelope is persisted store-and-forward (survives restart). */
  enqueued: boolean;
  /** True if the recipient was online and the host pushed it immediately too.
   *  Delivery is still at-least-once; the recipient acks to confirm + delete. */
  delivered_now?: boolean;
}

/** The only thing the host stores and relays. `blob` is opaque to the host. */
export interface MailboxMessage {
  /** Host-assigned, unique. Used to correlate delivery → ack → delete. */
  id: string;
  /** Recipient channel_id (canonical) or resolvable alias. */
  to: RecipientAddress;
  /** Sender channel_id, stamped by the host from the authenticated socket. */
  from: RecipientAddress;
  /** Opaque signed envelope bytes, base64. Host never parses this. */
  blob: string;
  /** Host enqueue timestamp (epoch ms). */
  ts: number;
  /** OPTIONAL observability correlation id (ea-claude-138). ADDITIVE: a
   *  sender that stamps a trace_id inside its signed envelope mirrors it
   *  here so the host can log/correlate hops WITHOUT parsing the blob.
   *  Absent from old (≤0.12.x) senders — never required, never trusted for
   *  routing or auth. */
  trace_id?: string;
}

/**
 * Transport seam. The agent client (ea-claude-065) implements this over the
 * dial-out `wss`; the host (ea-claude-064) provides the relay it talks to.
 *
 * Delivery semantics: at-least-once. The host queues if the recipient is
 * offline, (re)delivers every unacked message on reconnect, and deletes only
 * after the recipient acks by `id`. Recipients MUST dedupe by the inner
 * envelope's `message_id` (existing Message Envelope field).
 */
export interface Transport {
  /** Hand an opaque signed envelope to the host for delivery to `recipient`.
   *  Resolves once the host has durably enqueued it (store-and-forward). */
  send(recipient: RecipientAddress, opaqueEnvelopeBytes: Uint8Array): Promise<Ack>;
  /** Async stream of opaque envelopes addressed to this agent, including any
   *  queued while it was offline, delivered on (re)connect. The consumer acks
   *  each by calling `ack(id)` after it has been applied. */
  receive(): AsyncIterable<MailboxMessage>;
  /** Confirm an envelope was applied so the host can delete it. */
  ack(id: string): Promise<void>;
}

// ── Contract 1 wire frames (over the existing host↔agent `wss`) ──────────────
// These extend docs/wire-protocol.md. All carried as single JSON text frames.
//
//   Agent A → Host   { type:"mailbox_send",    request_id, to, blob_b64 }
//   Host → Agent A   { type:"mailbox_send_ok",  request_id, id }
//                    { type:"mailbox_send_err", request_id, error }
//   Host → Agent B   { type:"mailbox_deliver",  id, from, blob_b64, ts }
//   Agent B → Host   { type:"mailbox_ack",      id }
//
// On B's (re)connect the host flushes every unacked message whose `to` is B's
// channel_id. `from` is authoritative (host-stamped from the sending socket);
// the agent MUST NOT trust an attacker-supplied `from` inside the blob over it.

export interface MailboxSendFrame {
  type: "mailbox_send";
  request_id: string;
  to: RecipientAddress;
  blob_b64: string;
  /** Optional trace correlation id (ea-claude-138) — see MailboxMessage. */
  trace_id?: string;
}
export interface MailboxSendOkFrame {
  type: "mailbox_send_ok";
  request_id: string;
  id: string;
}
export interface MailboxSendErrFrame {
  type: "mailbox_send_err";
  request_id: string;
  error: string;
}
export interface MailboxDeliverFrame {
  type: "mailbox_deliver";
  id: string;
  from: RecipientAddress;
  blob_b64: string;
  ts: number;
  /** Optional trace correlation id (ea-claude-138), echoed from the send. */
  trace_id?: string;
}
export interface MailboxAckFrame {
  type: "mailbox_ack";
  id: string;
}

// ── Handle registry frames (spec-096) ───────────────────────────────────────
//   Agent → Host   { type:"handle_claim", request_id, handle, card, claimed_at, claim_sig }
//   Host → Agent   { type:"handle_claim_ok",  request_id, handle }
//                  { type:"handle_claim_err", request_id, reason }
export interface HandleClaimFrame {
  type: "handle_claim";
  request_id: string;
  handle: string;
  card: unknown;
  claimed_at: number;
  claim_sig: string;
}
export interface HandleClaimOkFrame { type: "handle_claim_ok"; request_id: string; handle: string; }
export interface HandleClaimErrFrame { type: "handle_claim_err"; request_id: string; reason: "taken" | "bad_sig" | "bad_format" | "bad_card"; }

// ───────────────────────────────────────────────────────────────────────────
// Contract 2 — Object + grant + audit  (lead: openclaw; ea-claude-066)
// ───────────────────────────────────────────────────────────────────────────
//
// ONE object type (`request`), ONE grant scope (`object.read`), ≤1 attachment.
// Maps onto the existing model: SharedObject rides in a Message Envelope `body`;
// Grant is a Capability Grant narrowed to `scope:"object.read"`; AuditEvent is
// the existing append-only Relationship/Grant event log.
//
// HARD MVP limits (spec-0020 R2a/R2b/R4): no multi-type taxonomy, no multi-file,
// and NO delivery/commitment/verification/status field on the object — not even
// read-only. That execution lane is Shodai's (deferred).

/** The single shared-object type. One request + at most one attachment. */
export interface SharedObject {
  object_id: string;
  /** The ONLY type in the MVP. Multi-type taxonomy is deferred (R2a). */
  type: "request";
  /** Issuing agent (channel_id or did). */
  from_agent: string;
  request: {
    title: string;
    body: string;
  };
  /** ≤1 file (R2b). `ref` points at agent-held content; the host never stores it. */
  attachment?: {
    filename: string;
    mime: string;
    size: number;
    ref: string;
  };
  created_at: number;
  /** Detached signature by `from_agent` over the canonical object bytes. */
  signature: string;
  // NOTE (R4): intentionally NO status / state / delivered / verified / paid
  // field. Adding one is a spec-0020 violation — that is Shodai's lane.
}

/** A scoped, revocable grant. The MVP has exactly one scope. */
export interface Grant {
  grant_id: string;
  object_id: string;
  /** Granting agent (the object's owner). */
  issuer: string;
  /** Recipient the grant is for. Access is checked against (object_id, subject). */
  subject: string;
  /** The ONLY scope in the MVP (R3). */
  scope: "object.read";
  status: "active" | "revoked";
  issued_at: number;
  /** Optional expiry (epoch ms). Absent = no expiry. */
  expires_at?: number;
  signature: string;
}

/** Append-only audit event. Every create/grant/access/revoke writes one. */
export interface AuditEvent {
  event_id: string;
  type: "object_create" | "grant_issue" | "object_access" | "grant_revoke";
  /** Who performed the action (channel_id or did). */
  actor: string;
  /** The object_id or grant_id the event refers to. */
  ref_id: string;
  ts: number;
  signature: string;
}

/**
 * Fail-closed access rule (Contract 2's core, R3). A recipient may read
 * `object_id` IFF an `active`, unexpired `object.read` grant exists for
 * `(object_id, subject)`. Nothing is shared by default. Reference predicate —
 * the authoritative implementation lives in the agent (ea-claude-066), which
 * also writes the `object_access` audit event on a permitted read.
 */
export function canRead(
  grants: ReadonlyArray<Grant>,
  object_id: string,
  subject: string,
  now: number = Date.now()
): boolean {
  return grants.some(
    (g) =>
      g.object_id === object_id &&
      g.subject === subject &&
      g.scope === "object.read" &&
      g.status === "active" &&
      (g.expires_at === undefined || g.expires_at > now)
  );
}
