import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { embedTexts } from "@/lib/ai/embeddings";
import { QuotaExceededError } from "@/lib/ai/quota-retry";

// Keep the real ai module (for APICallError) but replace the network call.
const { embedMany } = vi.hoisted(() => ({ embedMany: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  embedMany,
}));

function rateLimited(retryDelay: string) {
  return new APICallError({
    message: "Quota exceeded",
    url: "x",
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({
      error: { details: [{ retryDelay }] },
    }),
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Fake timers stand in for the real 45s waits, and also drive the rate
  // limiter's clock.
  vi.useFakeTimers();
  process.env = {
    ...ORIGINAL_ENV,
    EMBEDDING_PROVIDER: "google",
    EMBEDDING_MODEL: "gemini-embedding-001",
    EMBEDDING_DIMENSIONS: "768",
  };
  embedMany.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe("embedTexts", () => {
  it("waits out a 429's retry delay instead of failing fast", async () => {
    embedMany
      .mockRejectedValueOnce(rateLimited("45s"))
      .mockResolvedValueOnce({ embeddings: [[0.1, 0.2]] });

    const result = embedTexts(["hello"]);

    // Not retried yet at 44s...
    await vi.advanceTimersByTimeAsync(44_000);
    expect(embedMany).toHaveBeenCalledTimes(1);

    // ...but retried once Google's 45s delay has passed.
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toEqual([[0.1, 0.2]]);
    expect(embedMany).toHaveBeenCalledTimes(2);
  });

  it("disables the SDK's own fast retries", async () => {
    embedMany.mockResolvedValueOnce({ embeddings: [[1]] });

    await embedTexts(["hello"]);

    expect(embedMany).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("throws QuotaExceededError when the quota stays exceeded", async () => {
    embedMany.mockRejectedValue(rateLimited("10s"));

    const result = embedTexts(["hello"]);
    const assertion = expect(result).rejects.toBeInstanceOf(QuotaExceededError);
    await vi.advanceTimersByTimeAsync(60_000);

    await assertion;
    expect(embedMany).toHaveBeenCalledTimes(4);
  });
});
