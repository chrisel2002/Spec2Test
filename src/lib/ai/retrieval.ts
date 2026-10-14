import { cosineDistance, desc, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { chunks } from "@/lib/db/schema";

import { embedTexts } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
  heading: string | null;
  headingLevel: number | null;
  page: number | null;
  // Cosine similarity in [-1, 1] (in practice [0, 1] for text embeddings);
  // 1 means identical direction, i.e. most relevant.
  similarity: number;
};

export async function retrieveRelevantChunks(
  question: string,
  options?: { topK?: number },
): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? 5;
  const [questionEmbedding] = await embedTexts([question]);

  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, questionEmbedding)})`;

  return db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      content: chunks.content,
      heading: chunks.heading,
      headingLevel: chunks.headingLevel,
      page: chunks.page,
      similarity,
    })
    .from(chunks)
    // Chunks of a document whose embedding is paused have no vector yet.
    .where(isNotNull(chunks.embedding))
    .orderBy(desc(similarity))
    .limit(topK);
}
