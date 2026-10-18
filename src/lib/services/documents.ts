import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { listDocumentSummaries } from "@/lib/db/queries";
import { documents } from "@/lib/db/schema";
import {
  embedPendingChunks,
  type EmbedResult,
  ingestDocument,
  type IngestResult,
} from "@/lib/ingest/pipeline";
import { IngestInputError, validateSpecFile } from "@/lib/ingest/validate";

import { requireUuid, ServiceError } from "./errors";

export function listDocuments() {
  return listDocumentSummaries();
}

export async function getDocument(documentId: string) {
  const id = requireUuid(documentId, "document");
  const [document] = await db
    .select({ id: documents.id, filename: documents.filename, status: documents.status })
    .from(documents)
    .where(eq(documents.id, id));
  if (!document) throw new ServiceError("Document not found", "not_found");
  return document;
}

// Parses, chunks, and embeds a spec. Re-ingesting the same bytes returns
// the existing document instead of a duplicate (see ingestDocument).
//
// The same checks for a browser upload and an MCP ingest_spec call: file
// type by content as well as extension, size, emptiness, and (while
// parsing) PDF page count and readability. A problem with the file is an
// IngestInputError, whose message is meant for the uploader.
export async function ingestSpec(input: { filename: string; data: Buffer }): Promise<IngestResult> {
  try {
    const { mimeType } = validateSpecFile(input.filename, input.data);
    return await ingestDocument({ filename: input.filename, mimeType, data: input.data });
  } catch (error) {
    if (error instanceof IngestInputError) throw new ServiceError(error.message, "invalid");
    throw error;
  }
}

// Resumes a document whose embedding was paused ("waiting") or stopped
// ("failed"). Only chunks still missing an embedding are sent, so no
// quota is spent twice on the same chunk.
export async function resumeEmbedding(documentId: string): Promise<EmbedResult> {
  const document = await getDocument(documentId);
  return embedPendingChunks(document.id);
}
