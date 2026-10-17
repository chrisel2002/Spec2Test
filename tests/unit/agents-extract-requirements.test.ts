import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/generate-structured", () => ({
  generateStructured: vi.fn(),
}));

import { generateStructured } from "@/lib/ai/generate-structured";
import { extractRequirementsFromChunks } from "@/lib/agents/nodes/extract-requirements";

const mockGenerateStructured = vi.mocked(generateStructured);

function usage(inputTokens = 10, outputTokens = 20) {
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

beforeEach(() => {
  mockGenerateStructured.mockReset();
});

describe("extractRequirementsFromChunks", () => {
  it("resolves chunk labels back to real chunk IDs and assigns sequential codes", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        requirements: [
          { title: "A", text: "The system shall do A.", sourceChunkRefs: ["chunk_1"] },
          { title: "B", text: "The system shall do B.", sourceChunkRefs: ["chunk_2"] },
        ],
      },
      usage: usage(),
    });

    const { requirements } = await extractRequirementsFromChunks([
      { id: "chunk-id-1", content: "content 1" },
      { id: "chunk-id-2", content: "content 2" },
    ]);

    expect(requirements).toEqual([
      expect.objectContaining({
        id: "REQ-01",
        title: "A",
        sourceChunkIds: ["chunk-id-1"],
        isAmbiguous: false,
        ambiguityReason: null,
        suggestedRewrite: null,
      }),
      expect.objectContaining({ id: "REQ-02", sourceChunkIds: ["chunk-id-2"] }),
    ]);
  });

  it("drops a requirement whose cited chunk label doesn't exist — it can't be grounded", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        requirements: [
          { title: "A", text: "x", sourceChunkRefs: ["chunk_1"] },
          { title: "Hallucinated", text: "y", sourceChunkRefs: ["chunk_99"] },
        ],
      },
      usage: usage(),
    });

    const { requirements } = await extractRequirementsFromChunks([
      { id: "chunk-id-1", content: "content 1" },
    ]);

    expect(requirements).toHaveLength(1);
    expect(requirements[0].title).toBe("A");
  });

  it("batches chunks in groups of 5 — one generateStructured call per batch", async () => {
    mockGenerateStructured.mockResolvedValue({
      object: { requirements: [] },
      usage: usage(),
    });

    const chunks = Array.from({ length: 12 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
    }));
    await extractRequirementsFromChunks(chunks);

    // 12 chunks at batch size 5 -> 3 calls (5, 5, 2)
    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
  });

  it("returns an empty array when no chunks contain requirements", async () => {
    mockGenerateStructured.mockResolvedValue({
      object: { requirements: [] },
      usage: usage(),
    });

    const { requirements } = await extractRequirementsFromChunks([
      { id: "chunk-id-1", content: "just a heading, no requirement" },
    ]);

    expect(requirements).toEqual([]);
  });

  it("accumulates token usage across batches", async () => {
    mockGenerateStructured
      .mockResolvedValueOnce({ object: { requirements: [] }, usage: usage(10, 20) })
      .mockResolvedValueOnce({ object: { requirements: [] }, usage: usage(5, 15) });

    const chunks = Array.from({ length: 6 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
    }));
    const { usage: total } = await extractRequirementsFromChunks(chunks);

    expect(total).toEqual({ inputTokens: 15, outputTokens: 35, totalTokens: 50 });
  });
});

describe("extractRequirementsFromChunks onBatch", () => {
  it("reports each batch's requirements and progress as soon as they exist", async () => {
    mockGenerateStructured
      .mockResolvedValueOnce({
        object: {
          requirements: [{ title: "A", text: "The system shall do A.", sourceChunkRefs: ["chunk_1"] }],
        },
        usage: usage(),
      })
      .mockResolvedValueOnce({
        object: {
          requirements: [{ title: "B", text: "The system shall do B.", sourceChunkRefs: ["chunk_2"] }],
        },
        usage: usage(),
      });

    const chunks = Array.from({ length: 7 }, (_, i) => ({ id: `chunk-${i}`, content: `c${i}` }));
    const batches: { codes: string[]; done: number; total: number }[] = [];
    await extractRequirementsFromChunks(chunks, {
      onBatch: async (batch, progress) => {
        batches.push({ codes: batch.map((r) => r.id), ...progress });
      },
    });

    // Numbering continues across batches rather than restarting.
    expect(batches).toEqual([
      { codes: ["REQ-01"], done: 5, total: 7 },
      { codes: ["REQ-02"], done: 7, total: 7 },
    ]);
  });
});
