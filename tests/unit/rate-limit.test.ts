import { describe, expect, it } from "vitest";

import { clientKey, RateLimiter } from "@/lib/rate-limit";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit within the window, then refuses", () => {
    const time = clock();
    const limiter = new RateLimiter(3, 60_000, time.now);

    expect([1, 2, 3].map(() => limiter.check("a").allowed)).toEqual([true, true, true]);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterMs: 60_000 });
  });

  it("says how long until the oldest request leaves the window", () => {
    const time = clock();
    const limiter = new RateLimiter(2, 60_000, time.now);
    limiter.check("a");
    time.advance(20_000);
    limiter.check("a");
    time.advance(10_000);

    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterMs: 30_000 });
  });

  it("slides: a request is allowed again once an old one ages out", () => {
    const time = clock();
    const limiter = new RateLimiter(1, 60_000, time.now);
    limiter.check("a");
    time.advance(60_000);

    expect(limiter.check("a").allowed).toBe(true);
  });

  it("doesn't count refused requests against the client", () => {
    const time = clock();
    const limiter = new RateLimiter(1, 60_000, time.now);
    limiter.check("a");
    limiter.check("a");
    limiter.check("a");
    time.advance(60_000);

    expect(limiter.check("a").allowed).toBe(true);
  });

  it("counts each client separately", () => {
    const limiter = new RateLimiter(1, 60_000, clock().now);
    limiter.check("a");

    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});

describe("clientKey", () => {
  it("uses the first X-Forwarded-For address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to a single local key without a proxy", () => {
    expect(clientKey(new Headers())).toBe("local");
  });
});
