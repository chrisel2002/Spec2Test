import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { retrieveRelevantChunks } from "@/lib/ai/retrieval";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/ingest/pipeline";

let documentId: string | undefined;

beforeAll(async () => {
  const data = readFileSync(
    join(process.cwd(), "sample-specs/login-account-spec.md"),
  );
  const result = await ingestDocument({
    filename: "login-account-spec.md",
    mimeType: "text/markdown",
    data,
  });
  documentId = result.documentId;
});

afterAll(async () => {
  if (documentId) {
    await db.delete(documents).where(eq(documents.id, documentId));
  }
});

describe("retrieveRelevantChunks", () => {
  it("retrieves the account lockout requirement for a question about it", async () => {
    const results = await retrieveRelevantChunks(
      "What happens when a user enters the wrong password too many times?",
      { topK: 3 },
    );

    expect(results[0]?.heading).toContain("REQ-1.2");
    expect(results[0]?.content).toMatch(/lock(ed)?.*15 minutes/i);
    expect(results[0]?.similarity).toBeGreaterThan(0.5);
  });

  it("orders results by descending similarity", async () => {
    const results = await retrieveRelevantChunks("password reset", {
      topK: 5,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i].similarity).toBeLessThanOrEqual(
        results[i - 1].similarity,
      );
    }
  });
});
