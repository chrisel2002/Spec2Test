import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { QuotaExceededError } from "@/lib/ai/quota-retry";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { embedPendingChunks, ingestDocument } from "@/lib/ingest/pipeline";

// Real Postgres, fake embeddings: lets us simulate the quota running out
// partway through without spending (or needing) real quota.
const { embedTexts } = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock("@/lib/ai/embeddings", () => ({ embedTexts }));

function fakeVectors(texts: string[]): number[][] {
  return texts.map(() => Array.from({ length: 768 }, () => 0.01));
}

// 30 requirement sections -> more than one 20-chunk embedding batch. A
// random id keeps the content hash unique so reruns never collide.
const markdown = [
  `# Quota pause test ${randomUUID()}`,
  ...Array.from(
    { length: 30 },
    (_, i) => `## REQ-${i + 1}\n\nThe system shall do thing number ${i + 1}.`,
  ),
].join("\n\n");

let documentId: string | undefined;

afterAll(async () => {
  if (documentId) {
    await db.delete(documents).where(eq(documents.id, documentId));
  }
});

describe("ingest when the embedding quota runs out", () => {
  it("keeps finished batches, marks the document waiting, and resumes", async () => {
    embedTexts
      .mockImplementationOnce(async (texts: string[]) => fakeVectors(texts))
      .mockRejectedValueOnce(new QuotaExceededError(false));

    const paused = await ingestDocument({
      filename: "quota-pause.md",
      mimeType: "text/markdown",
      data: Buffer.from(markdown),
    });
    documentId = paused.documentId;

    expect(paused.status).toBe("waiting");
    expect(paused.embeddedCount).toBe(20);
    expect(paused.chunkCount).toBeGreaterThan(20);
    expect(paused.statusMessage).toMatch(/20 of \d+ chunks/);

    const [stored] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(stored?.status).toBe("waiting");

    embedTexts.mockImplementation(async (texts: string[]) => fakeVectors(texts));
    const resumed = await embedPendingChunks(documentId);

    expect(resumed.status).toBe("ready");
    expect(resumed.embeddedCount).toBe(resumed.chunkCount);

    // Resuming only embedded what was missing, not the first 20 again.
    const resumedTexts = embedTexts.mock.calls
      .slice(2)
      .reduce((sum, [texts]) => sum + (texts as string[]).length, 0);
    expect(resumedTexts).toBe(paused.chunkCount - 20);
  });
});
