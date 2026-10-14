import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { embedTexts } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";

import { chunkDocument } from "./chunk";
import { parseMarkdown } from "./markdown";
import { parsePdf } from "./pdf";
import type { ParsedDocument } from "./types";

export type IngestResult = {
  documentId: string;
  chunkCount: number;
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

  if (existing) {
    const existingChunks = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.documentId, existing.id));

    return {
      documentId: existing.id,
      chunkCount: existingChunks.length,
      alreadyExists: true,
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
    })
    .returning({ id: documents.id });

  for (let i = 0; i < pieces.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = pieces.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedTexts(batch.map((piece) => piece.content));

    await db.insert(chunks).values(
      batch.map((piece, batchIndex) => ({
        documentId: document.id,
        chunkIndex: i + batchIndex,
        content: piece.content,
        embedding: embeddings[batchIndex],
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
    chunkCount: pieces.length,
    alreadyExists: false,
  };
}
