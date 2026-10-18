import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { describe, expect, it } from "vitest";

import { AgentOutputError, publicErrorMessage } from "@/lib/agents/errors";
import { QuotaExceededError } from "@/lib/ai/quota-retry";

// Something an error could carry that must never reach a browser.
const SECRET = "AIzaSyD-FAKE-KEY-1234567890";

function providerError(statusCode: number) {
  return new APICallError({
    message: `Request to https://generativelanguage.googleapis.com/v1beta?key=${SECRET} failed`,
    url: `https://generativelanguage.googleapis.com/v1beta?key=${SECRET}`,
    requestBodyValues: { prompt: "the whole spec text" },
    statusCode,
    responseBody: JSON.stringify({ error: { message: `API key ${SECRET} is invalid` } }),
  });
}

describe("publicErrorMessage", () => {
  it("never repeats what a provider error contains", () => {
    const message = publicErrorMessage(providerError(400));

    expect(message).toBe("The model provider returned an error (HTTP 400). Try again later.");
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("googleapis");
  });

  it("explains rate limits, including after the SDK's own retries ran out", () => {
    const expected = "The model provider's rate limit was hit. Wait a minute, then retry.";
    expect(publicErrorMessage(providerError(429))).toBe(expected);
    expect(publicErrorMessage(new QuotaExceededError(true))).toBe(expected);
    expect(
      publicErrorMessage(
        new RetryError({ message: "Failed after 5 attempts", reason: "maxRetriesExceeded", errors: [providerError(429)] }),
      ),
    ).toBe(expected);
  });

  it("explains output that never matched the schema", () => {
    const error = new NoObjectGeneratedError({
      message: `bad JSON containing ${SECRET}`,
      response: { id: "r", timestamp: new Date(0), modelId: "m" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } as NoObjectGeneratedError["usage"] & object,
      finishReason: "stop",
    });
    expect(publicErrorMessage(error)).toMatch(/didn't match the expected format/);
  });

  it("explains network failures without the low-level detail", () => {
    expect(publicErrorMessage(new TypeError("fetch failed: ECONNREFUSED 10.0.0.5:443"))).toBe(
      "Couldn't reach the model provider. Check the connection, then retry.",
    );
  });

  it("passes through messages our own code wrote", () => {
    expect(publicErrorMessage(new AgentOutputError("Test generation returned 2 results for a batch of 3 requirements"))).toBe(
      "Test generation returned 2 results for a batch of 3 requirements",
    );
  });

  it("hides anything else, including stack traces", () => {
    const error = new Error(`connect to postgres://admin:${SECRET}@db/spec2test failed`);
    const message = publicErrorMessage(error);

    expect(message).toMatch(/^Something went wrong in this step/);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("at ");
  });
});
