import { generateObject, type LanguageModelUsage, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

import { addUsage, emptyUsage, type Usage } from "@/lib/agents/usage";

import { mockStructuredObject } from "./mock-model";
import { getChatModel } from "./providers";

// Free-tier Gemini rate limits mean occasional 429/503s are expected, not
// exceptional — 5 retries (up from the AI SDK's default of 2) gives its
// built-in exponential backoff more room to ride out a transient window
// before we give up and fail the whole pipeline step.
const MAX_RETRIES = 5;

// A response that doesn't fit the Zod schema (malformed JSON, a missing
// field) is retried once with the same prompt; models usually get it right
// the second time. More than once would mostly spend quota on a prompt
// that needs fixing instead.
const MAX_SCHEMA_ATTEMPTS = 2;

export type StructuredResult<T> = { object: T; usage: Usage };

// What happened in one generateStructured call, for the eval harness:
// whether the first response already passed the schema, and what the call
// cost in tokens and time (failed attempts included).
export type StructuredCallEvent = {
  schemaValidFirstTry: boolean;
  attempts: number;
  succeeded: boolean;
  usage: Usage;
  durationMs: number;
};

type Observer = (event: StructuredCallEvent) => void;
const observers = new Set<Observer>();

// Lets a caller (the eval runner) watch every structured model call made
// while it's subscribed, without threading a callback through every agent
// node. Returns an unsubscribe function.
export function observeStructuredCalls(observer: Observer): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

function toUsage(usage: LanguageModelUsage | undefined): Usage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}

async function callModel<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<StructuredResult<T>> {
  // The mock's output goes through the same schema as a real response, so
  // a mock that drifts from the schema fails just like a bad model would.
  if (process.env.MODEL_PROVIDER === "mock") {
    const { object, usage } = await mockStructuredObject(options.system, options.prompt);
    return { object: options.schema.parse(object), usage };
  }

  const result = await generateObject({
    model: getChatModel(),
    schema: options.schema,
    system: options.system,
    prompt: options.prompt,
    maxRetries: MAX_RETRIES,
  });
  return { object: result.object, usage: toUsage(result.usage) };
}

export async function generateStructured<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<StructuredResult<T>> {
  const started = Date.now();
  let usage = emptyUsage();
  const report = (attempts: number, succeeded: boolean) => {
    const event = {
      schemaValidFirstTry: succeeded && attempts === 1,
      attempts,
      succeeded,
      usage,
      durationMs: Date.now() - started,
    };
    observers.forEach((observer) => observer(event));
  };

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await callModel(options);
      usage = addUsage(usage, result.usage);
      report(attempt, true);
      return { object: result.object, usage };
    } catch (error) {
      // Only schema failures are retried here; network errors and rate
      // limits were already retried inside generateObject.
      if (!NoObjectGeneratedError.isInstance(error)) {
        report(attempt, false);
        throw error;
      }
      // The failed attempt still used (and is billed for) tokens.
      usage = addUsage(usage, toUsage(error.usage));
      if (attempt >= MAX_SCHEMA_ATTEMPTS) {
        report(attempt, false);
        throw error;
      }
    }
  }
}
