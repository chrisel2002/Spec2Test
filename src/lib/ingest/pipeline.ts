import { createHash } from "node:crypto";

import { and, asc, count, eq, isNull } from "drizzle-orm";

import { embedTexts } from "@/lib/ai/embeddings";
import { QuotaExceededError } from "@/lib/ai/quota-retry";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";

import { chunkDocument } from "./chunk";
import { parseMarkdown } from "./markdown";
import { parsePdf } from "./pdf";
import type { ParsedDocument } from "./types";

export type DocumentStatus = (typeof documents.$inferSelect)["status"];

export type EmbedResult = {
  status: DocumentStatus;
  statusMessage: string | null;
  chunkCount: number;
  embeddedCount: number;
};

export type IngestResult = EmbedResult & {
  documentId: string;
  alreadyExists: boolean;
};

// One batchEmbedContents call per batch (Google caps it at 100 texts).
// Batching saves round trips but not quota: Gemini counts each text as a
// request, so the rate limiter in embedTexts() still charges 20 per batch.
// Small batches also bound how much work one failed call has to redo.
const EMBEDDING_BATCH_SIZE = 20;

function parseByMimeType(
  mimeType: string,
  data: Buffer,
): Promise<ParsedDocument> | ParsedDocument {
  if (mimeType === "application/pdf") {
    return parsePdf(new Uint8Array(data));
  }
  return parseMarkdown(data.toString("utf8"));
}

export async function ingestDocument(options: {
  filename: string;
  mimeType: string;
  data: Buffer;
}): Promise<IngestResult> {
  const { filename, mimeType, data } = options;
  const contentHash = createHash("sha256").update(data).digest("hex");

  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.contentHash, contentHash))
    .limit(1);

  // Re-uploading a document whose embedding was paused resumes it; for a
  // ready document this finds no pending chunks and returns immediately.
  if (existing) {
    return {
      documentId: existing.id,
      alreadyExists: true,
      ...(await embedPendingChunks(existing.id)),
    };
  }

  const parsed = await parseByMimeType(mimeType, data);
  const pieces = chunkDocument(parsed);

  const [document] = await db
    .insert(documents)
    .values({
      filename,
      mimeType,
      rawText: parsed.text,
      contentHash,
      status: "embedding",
    })
    .returning({ id: documents.id });

  // Store every chunk up front with no embedding, then fill embeddings in.
  // If the quota runs out halfway, the remaining work is simply "chunks
  // where embedding is null", so resuming needs no extra bookkeeping.
  if (pieces.length > 0) {
    await db.insert(chunks).values(
      pieces.map((piece, chunkIndex) => ({
        documentId: document.id,
        chunkIndex,
        content: piece.content,
        heading: piece.heading,
        headingLevel: piece.headingLevel,
        page: piece.page,
        charStart: piece.charStart,
        charEnd: piece.charEnd,
      })),
    );
  }

  return {
    documentId: document.id,
    alreadyExists: false,
    ...(await embedPendingChunks(document.id)),
  };
}

export function quotaPausedMessage(
  isDailyQuota: boolean,
  embeddedCount: number,
  chunkCount: number,
): string {
  const progress = `${embeddedCount} of ${chunkCount} chunks are embedded`;
  return isDailyQuota
    ? `Paused: the Gemini free-tier daily embedding quota is used up (${progress}). It resets at midnight Pacific time; resume then.`
    : `Paused: the Gemini free-tier embedding quota (100 per minute) is still exceeded (${progress}). Resume in a minute or two.`;
}

async function countChunks(documentId: string) {
  const [counts] = await db
    .select({
      chunkCount: count(),
      // count(column) skips nulls, so this counts embedded chunks only.
      embeddedCount: count(chunks.embedding),
    })
    .from(chunks)
    .where(eq(chunks.documentId, documentId));

  return counts ?? { chunkCount: 0, embeddedCount: 0 };
}

async function setStatus(
  documentId: string,
  status: DocumentStatus,
  statusMessage: string | null,
) {
  await db
    .update(documents)
    .set({ status, statusMessage })
    .where(eq(documents.id, documentId));
}

// Embeds every chunk of the document that doesn't have an embedding yet,
// one batch at a time. Each batch is saved as soon as it's embedded, so
// progress survives a quota pause. Called on upload, on re-upload of the
// same file, and by the Resume endpoint.
export async function embedPendingChunks(
  documentId: string,
): Promise<EmbedResult> {
  await setStatus(documentId, "embedding", null);

  try {
    for (;;) {
      const batch = await db
        .select({ id: chunks.id, content: chunks.content })
        .from(chunks)
        .where(and(eq(chunks.documentId, documentId), isNull(chunks.embedding)))
        .orderBy(asc(chunks.chunkIndex))
        .limit(EMBEDDING_BATCH_SIZE);

      if (batch.length === 0) break;

      const embeddings = await embedTexts(batch.map((chunk) => chunk.content));

      await db.transaction(async (tx) => {
        for (const [i, chunk] of batch.entries()) {
          await tx
            .update(chunks)
            .set({ embedding: embeddings[i] })
            .where(eq(chunks.id, chunk.id));
        }
      });
    }
  } catch (error) {
    const counts = await countChunks(documentId);

    if (error instanceof QuotaExceededError) {
      const statusMessage = quotaPausedMessage(
        error.isDailyQuota,
        counts.embeddedCount,
        counts.chunkCount,
      );
      await setStatus(documentId, "waiting", statusMessage);
      return { status: "waiting", statusMessage, ...counts };
    }

    await setStatus(
      documentId,
      "failed",
      "Embedding failed unexpectedly. Try resuming; if it keeps failing, check the server logs.",
    );
    throw error;
  }

  await setStatus(documentId, "ready", null);
  return { status: "ready", statusMessage: null, ...(await countChunks(documentId)) };
}
