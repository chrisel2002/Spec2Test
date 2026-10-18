import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

import { isRateLimitError } from "@/lib/ai/quota-retry";

// An error our own code raises about the model's output, e.g. "returned 3
// results for a batch of 5". We wrote the message, so it's safe to show.
export class AgentOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOutputError";
  }
}

// What a user may see about a failed step or run. Errors from the model
// provider can carry request details, response bodies, or internals, and
// a run's error is shown in the browser and to MCP clients, so only
// messages we wrote are passed through. The full error goes to the server
// log at the point of failure.
export function publicErrorMessage(error: unknown): string {
  if (error instanceof AgentOutputError) return error.message;
  if (isRateLimitError(error)) {
    return "The model provider's rate limit was hit. Wait a minute, then retry.";
  }
  if (RetryError.isInstance(error)) return publicErrorMessage(error.lastError);
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The model's answer didn't match the expected format, even after a retry.";
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? ` (HTTP ${error.statusCode})` : "";
    return `The model provider returned an error${status}. Try again later.`;
  }
  if (error instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(error.message)) {
    return "Couldn't reach the model provider. Check the connection, then retry.";
  }
  return "Something went wrong in this step. Retry it; if it keeps failing, check the server logs.";
}
