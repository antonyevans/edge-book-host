// Sliding failure-counter, in-memory. One key per remote IP for the pair
// endpoint. Not for distributed deployments — single Fly machine target.
//
// Only FAILED attempts count toward the limit. A successful pair calls reset(),
// so legitimate first-try pairers never accumulate budget. This matters on
// shared egress (venue wifi): many attendees behind one public IP each pair
// once successfully without ever tripping the limit; only repeated wrong-code
// guessing from an IP gets locked out. (ea-claude-058)

interface Bucket {
  count: number;
  reset_at: number;
  locked_until: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly lockoutMs: number
  ) {}

  // Read-only gate. Does NOT count an attempt. True unless the IP is currently
  // locked out from too many prior failures.
  peek(key: string): { allowed: boolean; retry_after_ms: number } {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b) return { allowed: true, retry_after_ms: 0 };
    if (b.locked_until > now) {
      return { allowed: false, retry_after_ms: b.locked_until - now };
    }
    return { allowed: true, retry_after_ms: 0 };
  }

  // Record a FAILED attempt (wrong/expired code). Trips a lockout once failures
  // exceed maxAttempts within the window.
  recordFailure(key: string): { locked: boolean; retry_after_ms: number } {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { count: 0, reset_at: now + this.windowMs, locked_until: 0 };
      this.buckets.set(key, b);
    }
    if (b.reset_at <= now) {
      b.count = 0;
      b.reset_at = now + this.windowMs;
    }
    b.count++;
    if (b.count > this.maxAttempts) {
      b.locked_until = now + this.lockoutMs;
      return { locked: true, retry_after_ms: this.lockoutMs };
    }
    return { locked: false, retry_after_ms: 0 };
  }

  // Clear an IP's failure budget — called on a successful pair.
  reset(key: string): void {
    this.buckets.delete(key);
  }
}
