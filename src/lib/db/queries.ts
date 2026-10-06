import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "./client";
import { chunks, documents } from "./schema";

export async function listDocumentSummaries() {
  return db
    .select({
      id: documents.id,
      filename: documents.filename,
      chunkCount: sql<number>`count(${chunks.id})`.mapWith(Number),
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));
}

export async function listChunksForDocument(documentId: string) {
  return db
    .select({
      id: chunks.id,
      content: chunks.content,
      heading: chunks.heading,
      page: chunks.page,
    })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(asc(chunks.chunkIndex));
}
