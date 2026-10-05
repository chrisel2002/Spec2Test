import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getChatModel,
  getEmbeddingModel,
  getEmbeddingProviderOptions,
} from "@/lib/ai/providers";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getChatModel", () => {
  it("builds a Google chat model from MODEL_PROVIDER/MODEL_NAME", () => {
    process.env.MODEL_PROVIDER = "google";
    process.env.MODEL_NAME = "gemini-flash-latest";

    const model = getChatModel();

    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe("gemini-flash-latest");
  });

  it("builds an OpenAI chat model when MODEL_PROVIDER=openai", () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.MODEL_NAME = "gpt-4o-mini";

    const model = getChatModel();

    expect(model.modelId).toBe("gpt-4o-mini");
  });

  it("throws for an unsupported provider", () => {
    process.env.MODEL_PROVIDER = "not-a-provider";
    process.env.MODEL_NAME = "whatever";

    expect(() => getChatModel()).toThrow(/not supported/);
  });

  it("throws when MODEL_NAME is missing", () => {
    process.env.MODEL_PROVIDER = "google";
    delete process.env.MODEL_NAME;

    expect(() => getChatModel()).toThrow(/MODEL_NAME/);
  });
});

describe("getEmbeddingModel", () => {
  it("builds a Google embedding model from EMBEDDING_PROVIDER/EMBEDDING_MODEL", () => {
    process.env.EMBEDDING_PROVIDER = "google";
    process.env.EMBEDDING_MODEL = "gemini-embedding-001";

    const model = getEmbeddingModel();

    expect(model.modelId).toBe("gemini-embedding-001");
  });

  it("rejects anthropic, which has no embeddings API", () => {
    process.env.EMBEDDING_PROVIDER = "anthropic";
    process.env.EMBEDDING_MODEL = "whatever";

    expect(() => getEmbeddingModel()).toThrow(/not supported/);
  });
});

describe("getEmbeddingProviderOptions", () => {
  it("maps EMBEDDING_DIMENSIONS to Google's outputDimensionality", () => {
    process.env.EMBEDDING_PROVIDER = "google";
    process.env.EMBEDDING_DIMENSIONS = "768";

    expect(getEmbeddingProviderOptions()).toEqual({
      google: { outputDimensionality: 768 },
    });
  });

  it("maps EMBEDDING_DIMENSIONS to OpenAI's dimensions option", () => {
    process.env.EMBEDDING_PROVIDER = "openai";
    process.env.EMBEDDING_DIMENSIONS = "768";

    expect(getEmbeddingProviderOptions()).toEqual({
      openai: { dimensions: 768 },
    });
  });
});
