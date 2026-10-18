import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/generate-structured", () => ({
  generateStructured: vi.fn(),
}));

import { generateStructured } from "@/lib/ai/generate-structured";
import { checkAmbiguityForRequirements } from "@/lib/agents/nodes/check-ambiguity";
import type { Requirement } from "@/lib/agents/schemas";

const mockGenerateStructured = vi.mocked(generateStructured);

function usage() {
  return { inputTokens: 10, outputTokens: 20, totalTokens: 30 };
}

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "REQ-01",
    title: "Something",
    text: "The system shall do something.",
    sourceChunkIds: ["chunk-1"],
    isAmbiguous: false,
    ambiguityReason: null,
    suggestedRewrite: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGenerateStructured.mockReset();
});

describe("checkAmbiguityForRequirements", () => {
  it("fills in isAmbiguous/reason/rewrite from the model's per-requirement result", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [
          { isAmbiguous: false, reason: null, suggestedRewrite: null },
          {
            isAmbiguous: true,
            reason: "'fast' has no measurable threshold",
            suggestedRewrite: "The system shall respond within 200ms.",
          },
        ],
      },
      usage: usage(),
    });

    const { requirements } = await checkAmbiguityForRequirements([
      makeRequirement({ id: "REQ-01" }),
      makeRequirement({ id: "REQ-02", text: "The system shall be fast." }),
    ]);

    expect(requirements[0]).toMatchObject({ id: "REQ-01", isAmbiguous: false });
    expect(requirements[1]).toMatchObject({
      id: "REQ-02",
      isAmbiguous: true,
      ambiguityReason: "'fast' has no measurable threshold",
      suggestedRewrite: "The system shall respond within 200ms.",
    });
  });

  it("matches results to requirements by position, preserving requirement order", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [
          { isAmbiguous: true, reason: "vague", suggestedRewrite: "rewrite A" },
          { isAmbiguous: false, reason: null, suggestedRewrite: null },
        ],
      },
      usage: usage(),
    });

    const { requirements } = await checkAmbiguityForRequirements([
      makeRequirement({ id: "REQ-01" }),
      makeRequirement({ id: "REQ-02" }),
    ]);

    expect(requirements.map((r) => r.id)).toEqual(["REQ-01", "REQ-02"]);
    expect(requirements[0].isAmbiguous).toBe(true);
    expect(requirements[1].isAmbiguous).toBe(false);
  });

  it("throws if the model returns the wrong number of results for a batch", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [{ isAmbiguous: false, reason: null, suggestedRewrite: null }],
      },
      usage: usage(),
    });

    await expect(
      checkAmbiguityForRequirements([
        makeRequirement({ id: "REQ-01" }),
        makeRequirement({ id: "REQ-02" }),
      ]),
    ).rejects.toThrow(/1 results? for a batch of 2/);
  });

  it("batches requirements in groups of 5", async () => {
    mockGenerateStructured.mockImplementation(async (opts) => {
      const batchSize = (opts.prompt.match(/<requirement /g) ?? []).length;
      return {
        object: {
          results: Array.from({ length: batchSize }, () => ({
            isAmbiguous: false,
            reason: null,
            suggestedRewrite: null,
          })),
        },
        usage: usage(),
      };
    });

    const requirements = Array.from({ length: 12 }, (_, i) =>
      makeRequirement({ id: `REQ-${i}` }),
    );
    await checkAmbiguityForRequirements(requirements);

    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
  });
});
