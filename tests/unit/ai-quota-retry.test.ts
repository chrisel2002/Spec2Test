import { APICallError, RetryError } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  isRateLimitError,
  parseQuotaError,
  QuotaExceededError,
  withQuotaRetry,
} from "@/lib/ai/quota-retry";

// Modelled on a real Gemini free-tier 429 response body.
function googleQuotaError({
  retryDelay = "45s",
  quotaId = "EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier",
}: { retryDelay?: string; quotaId?: string } = {}) {
  return new APICallError({
    message: "Quota exceeded",
    url: "https://generativelanguage.googleapis.com/v1beta/models/x:batchEmbedContents",
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({
      error: {
        code: 429,
        message: `Quota exceeded for metric embed_content_free_tier_requests, limit: 100. Please retry in ${retryDelay}.`,
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId }],
          },
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay,
          },
        ],
      },
    }),
  });
}

function recordingSleep() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

describe("parseQuotaError", () => {
  it("reads the retry delay from Google's RetryInfo detail", () => {
    expect(parseQuotaError(googleQuotaError({ retryDelay: "45s" }))).toEqual({
      retryDelayMs: 45_000,
      isDailyQuota: false,
    });
  });

  it("rounds fractional delays up", () => {
    expect(
      parseQuotaError(googleQuotaError({ retryDelay: "12.3456s" }))
        ?.retryDelayMs,
    ).toBe(12_346);
  });

  it("falls back to the 'retry in Ns' message text", () => {
    const error = new APICallError({
      message: "Quota exceeded. Please retry in 30s.",
      url: "x",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: "not json",
    });

    expect(parseQuotaError(error)?.retryDelayMs).toBe(30_000);
  });

  it("flags a per-day quota", () => {
    const error = googleQuotaError({
      quotaId: "EmbedContentRequestsPerDayPerProjectPerModel-FreeTier",
    });

    expect(parseQuotaError(error)?.isDailyQuota).toBe(true);
  });

  it("ignores errors that aren't 429s", () => {
    const serverError = new APICallError({
      message: "Internal error",
      url: "x",
      requestBodyValues: {},
      statusCode: 500,
    });

    expect(parseQuotaError(serverError)).toBeNull();
    expect(parseQuotaError(new Error("boom"))).toBeNull();
  });
});

describe("withQuotaRetry", () => {
  it("waits the delay Google asks for, then succeeds", async () => {
    const { sleeps, sleep } = recordingSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(googleQuotaError({ retryDelay: "45s" }))
      .mockResolvedValueOnce("embeddings");

    await expect(withQuotaRetry(fn, { sleep })).resolves.toBe("embeddings");
    expect(sleeps).toEqual([45_000]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses the default delay when Google gives none", async () => {
    const { sleeps, sleep } = recordingSleep();
    const noDelay = new APICallError({
      message: "Too many requests",
      url: "x",
      requestBodyValues: {},
      statusCode: 429,
    });
    const fn = vi.fn().mockRejectedValueOnce(noDelay).mockResolvedValueOnce(1);

    await withQuotaRetry(fn, { sleep, defaultDelayMs: 60_000 });

    expect(sleeps).toEqual([60_000]);
  });

  it("throws QuotaExceededError once retries run out", async () => {
    const { sleeps, sleep } = recordingSleep();
    const fn = vi.fn().mockRejectedValue(googleQuotaError());

    const result = withQuotaRetry(fn, { sleep, maxRetries: 3 });

    await expect(result).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(result).rejects.toMatchObject({ isDailyQuota: false });
    expect(fn).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
    expect(sleeps).toHaveLength(3);
  });

  it("gives up immediately on a daily quota, since waiting won't help", async () => {
    const { sleeps, sleep } = recordingSleep();
    const fn = vi.fn().mockRejectedValue(
      googleQuotaError({
        quotaId: "EmbedContentRequestsPerDayPerProjectPerModel-FreeTier",
      }),
    );

    await expect(withQuotaRetry(fn, { sleep })).rejects.toMatchObject({
      isDailyQuota: true,
    });
    expect(fn).toHaveBeenCalledOnce();
    expect(sleeps).toEqual([]);
  });

  it("gives up rather than wait longer than maxDelayMs", async () => {
    const { sleeps, sleep } = recordingSleep();
    const fn = vi.fn().mockRejectedValue(googleQuotaError({ retryDelay: "600s" }));

    await expect(
      withQuotaRetry(fn, { sleep, maxDelayMs: 120_000 }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(sleeps).toEqual([]);
  });

  it("rethrows non-quota errors without retrying", async () => {
    const { sleeps, sleep } = recordingSleep();
    const boom = new Error("network down");
    const fn = vi.fn().mockRejectedValue(boom);

    await expect(withQuotaRetry(fn, { sleep })).rejects.toBe(boom);
    expect(fn).toHaveBeenCalledOnce();
    expect(sleeps).toEqual([]);
  });
});

describe("isRateLimitError", () => {
  it("recognises a raw 429", () => {
    expect(isRateLimitError(googleQuotaError())).toBe(true);
  });

  it("recognises the AI SDK's RetryError when its last attempt was a 429", () => {
    const error = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [googleQuotaError(), googleQuotaError()],
    });
    expect(isRateLimitError(error)).toBe(true);
  });

  it("recognises our own QuotaExceededError", () => {
    expect(isRateLimitError(new QuotaExceededError(true))).toBe(true);
  });

  it("does not treat other failures as rate limits", () => {
    const serverError = new APICallError({
      message: "Internal error",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 500,
    });
    expect(isRateLimitError(serverError)).toBe(false);
    expect(isRateLimitError(new Error("Schema validation failed"))).toBe(false);
    expect(
      isRateLimitError(
        new RetryError({ message: "x", reason: "maxRetriesExceeded", errors: [serverError] }),
      ),
    ).toBe(false);
  });
});
