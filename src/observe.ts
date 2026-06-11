// Host observability (ea-claude-138): structured JSON-line logging for
// mailbox operations + a bounded in-memory ring of recent trace hops that
// backs GET /admin/trace/<trace_id>.
//
// Invariants:
//   - Log lines are single JSON objects on stdout (visible in `fly logs`),
//     carrying routing metadata ONLY: event, host message id, truncated
//     from/to agent refs, trace_id when the sender supplied one. NEVER
//     message blobs, tokens, cookies, or envelope plaintext (the host cannot
//     see envelope plaintext by design — blobs stay opaque).
//   - The trace ring is bounded (TRACE_RING_CAPACITY hops) and in-memory:
//     restart loses it, which is fine — it is a debugging aid, not a record.
//   - logStructured never throws: observability must never break the relay.

export type ObsField = string | number | boolean | undefined;

// One JSON line to stdout: {"ts":"…","event":"mailbox_enqueue",…}.
// Undefined fields are dropped (JSON.stringify omits them).
export function logStructured(event: string, fields: Record<string, ObsField> = {}): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
  } catch {
    /* observability must never break the relay */
  }
}

export type TraceHopKind = "enqueue" | "deliver" | "ack" | "expire";

export interface TraceHop {
  trace_id: string;
  hop: TraceHopKind;
  /** Host-assigned mailbox message id. */
  id: string;
  /** Truncated sender/recipient refs (channel_id/DID prefixes). */
  from?: string;
  to?: string;
  ts: number;
}

export const TRACE_RING_CAPACITY = 1000;

// Bounded FIFO of recent trace hops. O(n) lookup is fine at this size.
export class TraceRing {
  private hops: TraceHop[] = [];

  constructor(private readonly capacity = TRACE_RING_CAPACITY) {}

  record(hop: TraceHop): void {
    this.hops.push(hop);
    if (this.hops.length > this.capacity) this.hops.splice(0, this.hops.length - this.capacity);
  }

  lookup(trace_id: string): TraceHop[] {
    return this.hops.filter((h) => h.trace_id === trace_id);
  }

  size(): number {
    return this.hops.length;
  }
}

// Process-wide ring shared by channels.ts (writers) and admin.ts (reader).
export const traceRing = new TraceRing();

// Short, non-sensitive ref for logs (sha256/DID prefix; never a key/token).
export function shortRef(value: string): string {
  return value.slice(0, 12);
}
