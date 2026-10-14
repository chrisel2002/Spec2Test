// A sliding-window limiter: at most `limit` units in any `windowMs` span.
// A unit is whatever the quota counts. For Gemini embeddings that's one
// per text, even inside a single batched HTTP call, so callers acquire
// `texts.length` units, not 1.
//
// Sliding window over fixed buckets ("reset every minute on the minute")
// because a fixed bucket allows 2x the limit across a boundary: 100 at
// 0:59 plus 100 at 1:01. A token bucket would also work, but this is
// easier to reason about against an "N per minute" quota.
//
// State is in memory, so it limits one server process. That's enough for
// local dev and a single Cloud Run instance; several instances sharing one
// API key would need a shared counter (e.g. a Postgres or Redis row).
export class SlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  // One timestamp per unit acquired, oldest first.
  private timestamps: number[] = [];

  constructor(options: {
    limit: number;
    windowMs: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // Resolves once `cost` units fit in the window, waiting if needed.
  async acquire(cost: number): Promise<void> {
    if (cost > this.limit) {
      throw new Error(
        `Cannot acquire ${cost} units: the limit is ${this.limit} per window`,
      );
    }

    for (;;) {
      const now = this.now();
      this.timestamps = this.timestamps.filter(
        (t) => t > now - this.windowMs,
      );

      if (this.timestamps.length + cost <= this.limit) {
        for (let i = 0; i < cost; i++) this.timestamps.push(now);
        return;
      }

      // To fit `cost` more, the oldest `excess` units must expire first;
      // wait until the last of those leaves the window, then re-check
      // (another caller may have taken the space in the meantime).
      const excess = this.timestamps.length + cost - this.limit;
      const freedAt = this.timestamps[excess - 1] + this.windowMs;
      await this.sleep(Math.max(freedAt - now, 1));
    }
  }
}
