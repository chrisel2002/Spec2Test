import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/ingest/pipeline";

const data = readFileSync(
  join(process.cwd(), "sample-specs/login-account-spec.md"),
);

let documentId: string | undefined;

afterAll(async () => {
  if (documentId) {
    await db.delete(documents).where(eq(documents.id, documentId));
  }
});

describe("ingestDocument", () => {
  it("parses, chunks, embeds, and stores a document", async () => {
    const result = await ingestDocument({
      filename: "login-account-spec.md",
      mimeType: "text/markdown",
      data,
    });
    documentId = result.documentId;

    expect(result.alreadyExists).toBe(false);
    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.embeddedCount).toBe(result.chunkCount);

    const stored = await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, result.documentId));

    expect(stored).toHaveLength(result.chunkCount);
    expect(stored[0].embedding).toHaveLength(768);
    expect(stored.some((c) => c.heading?.startsWith("REQ-1.2:"))).toBe(true);
  });

  it("is idempotent: re-ingesting the same bytes does not duplicate chunks", async () => {
    const result = await ingestDocument({
      filename: "login-account-spec.md",
      mimeType: "text/markdown",
      data,
    });

    expect(result.alreadyExists).toBe(true);
    expect(result.documentId).toBe(documentId);

    const stored = await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, documentId!));

    expect(stored).toHaveLength(result.chunkCount);
  });
});
