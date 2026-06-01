// Token-bucket-style sliding counter, in-memory. One key per remote IP for the
// pair endpoint. Not for distributed deployments — single Fly machine target.

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

  check(key: string): { allowed: boolean; retry_after_ms: number } {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { count: 0, reset_at: now + this.windowMs, locked_until: 0 };
      this.buckets.set(key, b);
    }
    if (b.locked_until > now) {
      return { allowed: false, retry_after_ms: b.locked_until - now };
    }
    if (b.reset_at <= now) {
      b.count = 0;
      b.reset_at = now + this.windowMs;
    }
    b.count++;
    if (b.count > this.maxAttempts) {
      b.locked_until = now + this.lockoutMs;
      return { allowed: false, retry_after_ms: this.lockoutMs };
    }
    return { allowed: true, retry_after_ms: 0 };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
