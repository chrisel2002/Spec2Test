import { describe, expect, it } from "vitest";

import { buildExcerptContext } from "@/lib/ai/prompts/chat-with-spec";
import type { RetrievedChunk } from "@/lib/ai/retrieval";

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    content: "The system shall do something.",
    heading: null,
    headingLevel: null,
    page: null,
    similarity: 0.9,
    ...overrides,
  };
}

describe("buildExcerptContext", () => {
  it("says no excerpts were retrieved when there are none", () => {
    expect(buildExcerptContext([])).toMatch(/no excerpts/i);
  });

  it("numbers excerpts starting at 1", () => {
    const context = buildExcerptContext([
      makeChunk({ content: "First." }),
      makeChunk({ content: "Second." }),
    ]);

    expect(context).toContain("[1]");
    expect(context).toContain("First.");
    expect(context).toContain("[2]");
    expect(context).toContain("Second.");
  });

  it("includes heading and page when present", () => {
    const context = buildExcerptContext([
      makeChunk({ heading: "REQ-1.2: Account lockout", page: 3 }),
    ]);

    expect(context).toContain("REQ-1.2: Account lockout");
    expect(context).toContain("page 3");
  });

  it("omits the location line when heading and page are both absent", () => {
    const context = buildExcerptContext([makeChunk()]);

    expect(context).toBe("[1]\nThe system shall do something.");
  });
});
