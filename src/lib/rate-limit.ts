// A sliding-window request limiter keyed by client (or "*" for everyone).
// It remembers when each recent request happened and allows a new one
// only if fewer than `limit` happened in the last `windowMs`.
//
// In memory, per server process: enough to stop the free quotas being used
// up by accident (a stuck script, a double-click loop, one busy user). It
// isn't an abuse defence: with several Cloud Run instances each keeps its
// own counts, and a determined client can spoof X-Forwarded-For. Those
// would need a shared store (Redis, or a Postgres table) and an API key.

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      // Free again when the oldest request in the window ages out.
      return { allowed: false, retryAfterMs: recent[0] + this.windowMs - now };
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.forgetIdleKeys(now);
    return { allowed: true };
  }

  // Keeps memory bounded: drop keys with no request in the window.
  private forgetIdleKeys(now: number) {
    if (this.hits.size < 1000) return;
    for (const [key, times] of this.hits) {
      if (times.every((time) => now - time >= this.windowMs)) this.hits.delete(key);
    }
  }
}

// The client's address as Cloud Run reports it: the first entry of
// X-Forwarded-For. Locally there's no proxy, so every request is "local".
export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
