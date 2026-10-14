import { describe, expect, it } from "vitest";

import { SlidingWindowRateLimiter } from "@/lib/ai/rate-limiter";

// A fake clock: sleep() just advances time, so tests run instantly and can
// assert exactly how long the limiter chose to wait.
function fakeClock() {
  const clock = { time: 0, sleeps: [] as number[] };
  return {
    clock,
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
}

describe("SlidingWindowRateLimiter", () => {
  it("lets requests through immediately while under the limit", async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 10,
      windowMs: 60_000,
      now,
      sleep,
    });

    await limiter.acquire(4);
    await limiter.acquire(6);

    expect(clock.sleeps).toEqual([]);
  });

  it("waits until enough old units leave the window", async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 10,
      windowMs: 60_000,
      now,
      sleep,
    });

    await limiter.acquire(6); // at t=0
    clock.time = 20_000;
    await limiter.acquire(4); // at t=20s, window now full
    clock.time = 30_000;

    // Needs 5 free: the 6 units from t=0 expire at t=60s.
    await limiter.acquire(5);

    expect(clock.sleeps).toEqual([30_000]);
    expect(clock.time).toBe(60_000);
  });

  it("counts a batch by its cost, not as one request", async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 100,
      windowMs: 60_000,
      now,
      sleep,
    });

    for (let i = 0; i < 5; i++) await limiter.acquire(20);
    await limiter.acquire(20);

    expect(clock.sleeps).toEqual([60_000]);
  });

  it("rejects a single request larger than the whole limit", async () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 10, windowMs: 1000 });

    await expect(limiter.acquire(11)).rejects.toThrow(/limit is 10/);
  });
});
