import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";

import { requireEnv } from "@/lib/env";

const CHAT_PROVIDERS = ["openai", "anthropic", "google"] as const;
type ChatProviderName = (typeof CHAT_PROVIDERS)[number];

// Anthropic has no embeddings API, so it's intentionally excluded here.
const EMBEDDING_PROVIDERS = ["openai", "google"] as const;
type EmbeddingProviderName = (typeof EMBEDDING_PROVIDERS)[number];

function readProviderEnv<T extends string>(
  envVar: string,
  allowed: readonly T[],
): T {
  const value = requireEnv(envVar);
  if (!allowed.includes(value as T)) {
    throw new Error(
      `${envVar}=${value} is not supported. Expected one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

export function getChatModel(): LanguageModel {
  const provider = readProviderEnv<ChatProviderName>(
    "MODEL_PROVIDER",
    CHAT_PROVIDERS,
  );
  const modelName = requireEnv("MODEL_NAME");

  switch (provider) {
    case "openai":
      return openai(modelName);
    case "anthropic":
      return anthropic(modelName);
    case "google":
      return google(modelName);
  }
}

export function getEmbeddingModel(): EmbeddingModel {
  const provider = readProviderEnv<EmbeddingProviderName>(
    "EMBEDDING_PROVIDER",
    EMBEDDING_PROVIDERS,
  );
  const modelName = requireEnv("EMBEDDING_MODEL");

  switch (provider) {
    case "openai":
      return openai.textEmbeddingModel(modelName);
    case "google":
      return google.textEmbeddingModel(modelName);
  }
}

type EmbeddingProviderOptions = {
  openai?: { dimensions?: number };
  google?: { outputDimensionality?: number };
};

// Passed to embed()/embedMany() so the configured output size (the pgvector
// column width) is enforced regardless of which embedding provider is active.
export function getEmbeddingProviderOptions(): EmbeddingProviderOptions {
  const provider = readProviderEnv<EmbeddingProviderName>(
    "EMBEDDING_PROVIDER",
    EMBEDDING_PROVIDERS,
  );
  const dimensions = Number(requireEnv("EMBEDDING_DIMENSIONS"));

  switch (provider) {
    case "openai":
      return { openai: { dimensions } };
    case "google":
      return { google: { outputDimensionality: dimensions } };
  }
}
