import { generateObject } from "ai";
import type { z } from "zod";

import { mockStructuredObject } from "./mock-model";
import { getChatModel } from "./providers";

// Free-tier Gemini rate limits mean occasional 429/503s are expected, not
// exceptional — 5 retries (up from the AI SDK's default of 2) gives its
// built-in exponential backoff more room to ride out a transient window
// before we give up and fail the whole pipeline step.
const MAX_RETRIES = 5;

export type StructuredResult<T> = {
  object: T;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

export async function generateStructured<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<StructuredResult<T>> {
  // The mock's output goes through the same schema as a real response, so
  // a mock that drifts from the schema fails just like a bad model would.
  if (process.env.MODEL_PROVIDER === "mock") {
    const { object, usage } = await mockStructuredObject(
      options.system,
      options.prompt,
    );
    return { object: options.schema.parse(object), usage };
  }

  const result = await generateObject({
    model: getChatModel(),
    schema: options.schema,
    system: options.system,
    prompt: options.prompt,
    maxRetries: MAX_RETRIES,
  });

  return {
    object: result.object,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
  };
}
