// Operator support mailbox (spec-134, ea-claude-139).
//
// The support recipient is an ORDINARY agent identity the operator runs
// (`edge-book support inbox --on`); the host knows only its DID, from the
// SUPPORT_DID env var (read per use, like ADMIN_TOKEN, so rotation needs no
// redeploy and tests can toggle it). `doctor --send` discovers it via
// GET /support/recipient and then sends a NORMAL mailbox envelope.
//
// Invariants:
//   - the host still never parses envelope blobs: the support size cap and
//     per-sender rate limit act purely on frame metadata (`to`, blob byte
//     length, authenticated sender channel) for sends addressed to SUPPORT_DID;
//   - SUPPORT_DID unset → no special casing anywhere, and GET /support/recipient
//     404s like any unknown route (the surface does not exist unless enabled);
//   - the limiter is in-memory fixed-window, single-machine — same scope as
//     rate-limit.ts. Restart clears it, which is acceptable for an abuse floor.
import type http from "node:http";

/** Hard cap per support bundle (mirrored client-side in edge-book-cli
 *  doctor-send.ts). Doctor bundles are tens of KiB; 256 KiB leaves headroom
 *  without letting the support queue become a blob dump. */
export const SUPPORT_MAX_BLOB_BYTES = 256 * 1024;
/** Per sender channel: 5 support sends per rolling hour window. */
export const SUPPORT_SENDS_PER_WINDOW = 5;
export const SUPPORT_WINDOW_MS = 60 * 60 * 1000;

export function supportRecipientDid(): string {
  return (process.env.SUPPORT_DID || "").trim();
}

interface SendWindow {
  count: number;
  reset_at: number;
}

// Fixed-window counter per sender channel_id (pattern: rate-limit.ts, but
// counting sends rather than failures — every accepted support send spends
// budget, because the host cannot tell a "good" bundle from a bad one without
// parsing the blob, which it must never do).
export class SupportSendLimiter {
  private windows = new Map<string, SendWindow>();

  constructor(
    private readonly max = SUPPORT_SENDS_PER_WINDOW,
    private readonly windowMs = SUPPORT_WINDOW_MS
  ) {}

  allow(sender: string, now: number = Date.now()): boolean {
    let w = this.windows.get(sender);
    if (!w || w.reset_at <= now) {
      w = { count: 0, reset_at: now + this.windowMs };
      this.windows.set(sender, w);
    }
    if (w.count >= this.max) return false;
    w.count++;
    return true;
  }
}

export type SupportSendVerdict =
  | { ok: true }
  | { ok: false; error: "support_bundle_too_large" | "support_rate_limited" };

// Frame-level gate for mailbox_send. Applies ONLY when a support recipient is
// configured AND the frame is addressed to it; all other traffic is untouched.
export function checkSupportSend(limiter: SupportSendLimiter, to: string, senderChannel: string, blobBytes: number): SupportSendVerdict {
  const did = supportRecipientDid();
  if (!did || to !== did) return { ok: true };
  if (blobBytes > SUPPORT_MAX_BLOB_BYTES) return { ok: false, error: "support_bundle_too_large" };
  if (!limiter.allow(senderChannel)) return { ok: false, error: "support_rate_limited" };
  return { ok: true };
}

// Route predicate kept here so the server's request arrow stays within its
// complexity budget (one condition at the call site).
export function isSupportRecipientRequest(req: http.IncomingMessage, url: URL): boolean {
  return url.pathname === "/support/recipient" && req.method === "GET";
}

// GET /support/recipient — public discovery for `doctor --send`. Fail closed:
// 404 (indistinguishable from an unknown route) when SUPPORT_DID is unset.
export function handleSupportRecipientRoute(res: http.ServerResponse): void {
  const did = supportRecipientDid();
  res.writeHead(did ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(did ? { ok: true, did } : { ok: false, error: "not_found" }));
}
