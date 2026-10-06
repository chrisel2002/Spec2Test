import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/generate-structured", () => ({
  generateStructured: vi.fn(),
}));

import { generateStructured } from "@/lib/ai/generate-structured";
import {
  effectiveText,
  generateTestsForRequirements,
} from "@/lib/agents/nodes/generate-tests";
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

function testCase(overrides: { title: string; type: "positive" | "negative" | "boundary" }) {
  return {
    title: overrides.title,
    type: overrides.type,
    given: "a precondition",
    when: "an action",
    then: "an outcome",
  };
}

beforeEach(() => {
  mockGenerateStructured.mockReset();
});

describe("effectiveText", () => {
  it("uses the original text for a non-ambiguous requirement", () => {
    const req = makeRequirement({ text: "original" });
    expect(effectiveText(req)).toBe("original");
  });

  it("uses the suggested rewrite for an ambiguous requirement", () => {
    const req = makeRequirement({
      text: "original",
      isAmbiguous: true,
      suggestedRewrite: "rewritten",
    });
    expect(effectiveText(req)).toBe("rewritten");
  });
});

describe("generateTestsForRequirements", () => {
  it("links generated test cases back to their requirement's code", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [
          {
            testCases: [
              testCase({ title: "Positive case", type: "positive" }),
              testCase({ title: "Negative case", type: "negative" }),
            ],
          },
        ],
      },
      usage: usage(),
    });

    const { testCases } = await generateTestsForRequirements([
      makeRequirement({ id: "REQ-07" }),
    ]);

    expect(testCases).toHaveLength(2);
    expect(testCases.every((tc) => tc.requirementId === "REQ-07")).toBe(true);
  });

  it("marks test cases from an ambiguous requirement as based on an assumption", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [
          { testCases: [testCase({ title: "A", type: "positive" }), testCase({ title: "B", type: "negative" })] },
        ],
      },
      usage: usage(),
    });

    const { testCases } = await generateTestsForRequirements([
      makeRequirement({
        id: "REQ-02",
        isAmbiguous: true,
        suggestedRewrite: "measurable version",
      }),
    ]);

    expect(testCases.every((tc) => tc.basedOnAssumption)).toBe(true);
  });

  it("does not mark test cases from a non-ambiguous requirement as assumptions", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: {
        results: [
          { testCases: [testCase({ title: "A", type: "positive" }), testCase({ title: "B", type: "boundary" })] },
        ],
      },
      usage: usage(),
    });

    const { testCases } = await generateTestsForRequirements([
      makeRequirement({ id: "REQ-01", isAmbiguous: false }),
    ]);

    expect(testCases.every((tc) => !tc.basedOnAssumption)).toBe(true);
  });

  it("throws if the model returns the wrong number of result entries for a batch", async () => {
    mockGenerateStructured.mockResolvedValueOnce({
      object: { results: [{ testCases: [testCase({ title: "A", type: "positive" }), testCase({ title: "B", type: "negative" })] }] },
      usage: usage(),
    });

    await expect(
      generateTestsForRequirements([
        makeRequirement({ id: "REQ-01" }),
        makeRequirement({ id: "REQ-02" }),
      ]),
    ).rejects.toThrow(/batch of 2/);
  });

  it("batches requirements in groups of 3", async () => {
    mockGenerateStructured.mockImplementation(async (opts) => {
      const batchSize = (opts.prompt.match(/^\d+\./gm) ?? []).length;
      return {
        object: {
          results: Array.from({ length: batchSize }, () => ({
            testCases: [testCase({ title: "A", type: "positive" }), testCase({ title: "B", type: "negative" })],
          })),
        },
        usage: usage(),
      };
    });

    const requirements = Array.from({ length: 7 }, (_, i) =>
      makeRequirement({ id: `REQ-${i}` }),
    );
    await generateTestsForRequirements(requirements);

    // 7 requirements at batch size 3 -> 3 calls (3, 3, 1)
    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
  });
});
