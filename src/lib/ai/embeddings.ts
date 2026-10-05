import { embedMany } from "ai";

import { requireEnv } from "@/lib/env";

import { getEmbeddingModel, getEmbeddingProviderOptions } from "./providers";

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

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: texts,
    providerOptions: getEmbeddingProviderOptions(),
  });

  return embeddings;
}
