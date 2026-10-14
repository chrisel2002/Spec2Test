import { APICallError } from "ai";
import { z } from "zod";

// Shape of Google's 429 body. The wait time lives in a RetryInfo detail
// ("retryDelay": "45s") rather than an HTTP Retry-After header, which is
// why the AI SDK's built-in retry (header-only) can't see it. Everything
// is optional: we only need to pick out the fields that are present.
const googleErrorBodySchema = z.object({
  error: z.object({
    message: z.string().optional(),
    details: z
      .array(
        z.looseObject({
          "@type": z.string().optional(),
          retryDelay: z.string().optional(),
          violations: z
            .array(z.looseObject({ quotaId: z.string().optional() }))
            .optional(),
        }),
      )
      .optional(),
  }),
});

export type QuotaErrorInfo = {
  // null when Google didn't say how long to wait.
  retryDelayMs: number | null;
  // A per-day quota resets at midnight Pacific; waiting seconds won't help.
  isDailyQuota: boolean;
};

// "45s" / "45.123s" -> ms
function parseDuration(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

// Returns null for anything that isn't a 429 quota error.
export function parseQuotaError(error: unknown): QuotaErrorInfo | null {
  if (!APICallError.isInstance(error) || error.statusCode !== 429) {
    return null;
  }

  let body: z.infer<typeof googleErrorBodySchema> | null = null;
  try {
    const parsed = googleErrorBodySchema.safeParse(
      JSON.parse(error.responseBody ?? ""),
    );
    if (parsed.success) body = parsed.data;
  } catch {
    // Not JSON: fall through to the message-text fallback below.
  }

  const details = body?.error.details ?? [];
  const retryInfo = details.find((d) => d.retryDelay !== undefined);
  // Fallback: the human-readable message says "Please retry in 45.1s."
  const messageDelay = /retry in (\d+(?:\.\d+)?s)/i.exec(
    body?.error.message ?? error.message,
  )?.[1];

  const delay = retryInfo?.retryDelay ?? messageDelay;
  const isDailyQuota = details.some((d) =>
    d.violations?.some((v) => v.quotaId?.includes("PerDay")),
  );

  return {
    retryDelayMs: delay ? parseDuration(delay) : null,
    isDailyQuota,
  };
}

export class QuotaExceededError extends Error {
  readonly isDailyQuota: boolean;

  constructor(isDailyQuota: boolean, options?: { cause?: unknown }) {
    super(
      isDailyQuota
        ? "The daily embedding quota is used up"
        : "The per-minute embedding quota is still exceeded after retrying",
      options,
    );
    this.name = "QuotaExceededError";
    this.isDailyQuota = isDailyQuota;
  }
}

export type QuotaRetryOptions = {
  maxRetries?: number;
  // Used when a 429 carries no retry delay.
  defaultDelayMs?: number;
  // Give up rather than wait longer than this for a single retry.
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

// Runs fn, and on a 429 waits as long as Google asks before trying again.
// Any other error is rethrown immediately. When retries run out, the delay
// is unreasonably long, or the daily quota is hit, throws
// QuotaExceededError so callers can pause the work instead of failing.
export async function withQuotaRetry<T>(
  fn: () => Promise<T>,
  {
    maxRetries = 3,
    defaultDelayMs = 60_000,
    maxDelayMs = 120_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: QuotaRetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const quota = parseQuotaError(error);
      if (!quota) throw error;

      const delayMs = quota.retryDelayMs ?? defaultDelayMs;
      if (quota.isDailyQuota || attempt >= maxRetries || delayMs > maxDelayMs) {
        throw new QuotaExceededError(quota.isDailyQuota, { cause: error });
      }

      console.warn(
        `Embedding quota exceeded; retrying in ${Math.round(delayMs / 1000)}s ` +
          `(retry ${attempt + 1} of ${maxRetries})`,
      );
      await sleep(delayMs);
    }
  }
}
