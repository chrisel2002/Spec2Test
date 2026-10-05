import { embedMany } from "ai";

import { getEmbeddingModel, getEmbeddingProviderOptions } from "./providers";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: texts,
    providerOptions: getEmbeddingProviderOptions(),
  });

  return embeddings;
}
