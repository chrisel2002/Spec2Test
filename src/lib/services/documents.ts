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

import { requireUuid, ServiceError } from "./errors";

export const MAX_SPEC_SIZE = 10 * 1024 * 1024; // 10 MB
const MIME_BY_EXTENSION = {
  ".md": "text/markdown",
  ".pdf": "application/pdf",
} as const;

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

// Same rules for a browser upload and an MCP ingest_spec call. Validated by
// extension because browsers report an unreliable (often empty) MIME type
// for .md files.
function mimeTypeFor(filename: string, size: number): string {
  if (size === 0) throw new ServiceError("File is empty", "invalid");
  if (size > MAX_SPEC_SIZE) throw new ServiceError("File exceeds the 10 MB limit", "invalid");
  const extension = Object.keys(MIME_BY_EXTENSION).find((ext) =>
    filename.toLowerCase().endsWith(ext),
  ) as keyof typeof MIME_BY_EXTENSION | undefined;
  if (!extension) {
    throw new ServiceError("Only .md and .pdf files are supported", "invalid");
  }
  return MIME_BY_EXTENSION[extension];
}

// Parses, chunks, and embeds a spec. Re-ingesting the same bytes returns
// the existing document instead of a duplicate (see ingestDocument).
export function ingestSpec(input: { filename: string; data: Buffer }): Promise<IngestResult> {
  const mimeType = mimeTypeFor(input.filename, input.data.length);
  return ingestDocument({ filename: input.filename, mimeType, data: input.data });
}

// Resumes a document whose embedding was paused ("waiting") or stopped
// ("failed"). Only chunks still missing an embedding are sent, so no
// quota is spent twice on the same chunk.
export async function resumeEmbedding(documentId: string): Promise<EmbedResult> {
  const document = await getDocument(documentId);
  return embedPendingChunks(document.id);
}
