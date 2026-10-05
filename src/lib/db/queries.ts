import { desc, eq, sql } from "drizzle-orm";

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
