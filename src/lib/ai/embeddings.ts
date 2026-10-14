import { embedMany } from "ai";

import { requireEnv } from "@/lib/env";

import { getEmbeddingModel, getEmbeddingProviderOptions } from "./providers";
import { SlidingWindowRateLimiter } from "./rate-limiter";

// Gemini's free tier allows 100 embedding requests per minute, and each
// text in a batch counts as one. 80 leaves headroom for chat questions
// (also embedded) and for clock drift between us and Google.
const DEFAULT_EMBEDDING_RPM_LIMIT = 80;

// Module-level so every caller in this process (ingest and chat retrieval)
// shares one budget.
const embeddingRateLimiter = new SlidingWindowRateLimiter({
  limit: Number(process.env.EMBEDDING_RPM_LIMIT) || DEFAULT_EMBEDDING_RPM_LIMIT,
  windowMs: 60_000,
});

// Lets e2e tests (and anyone without an API key) exercise the full upload
// pipeline without a real embedding call — set via playwright.config.ts's
// webServer env, never in .env.example/.env.local for normal use.
function mockEmbeddings(count: number): number[][] {
  const dimensions = Number(requireEnv("EMBEDDING_DIMENSIONS"));
  return Array.from({ length: count }, () =>
    Array.from({ length: dimensions }, () => Math.random() * 2 - 1),
  );
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (process.env.EMBEDDING_PROVIDER === "mock") {
    return mockEmbeddings(texts.length);
  }

  await embeddingRateLimiter.acquire(texts.length);

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: texts,
    providerOptions: getEmbeddingProviderOptions(),
  });

  return embeddings;
}
