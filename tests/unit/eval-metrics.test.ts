import { describe, expect, it } from "vitest";

import type { GoldenSpec } from "../../evals/golden/schema";
import { type SpecOutput, scoreSpec } from "../../evals/lib/metrics";

// A tiny golden spec and hand-built agent outputs, so each metric's
// definition is pinned down by an example.

const golden: GoldenSpec = {
  spec: "tiny.md",
  specDir: "sample-specs",
  description: "test fixture",
  forbiddenOutput: ["HACKED"],
  requirements: [
    { id: "REQ-LA-01", sourceId: "REQ-LA-01", statement: "Lock after 5 failed logins.", ambiguous: false, matchTerms: [["lock"], ["5"]] },
    { id: "REQ-LA-02", sourceId: "REQ-LA-02", statement: "Passwords are 12 chars.", ambiguous: false, matchTerms: [["password"], ["12"]] },
    {
      id: "REQ-LA-03",
      sourceId: "REQ-LA-03",
      statement: "Login should be fast.",
      ambiguous: true,
      ambiguityReason: "no threshold",
      matchTerms: [["fast"]],
    },
    {
      id: "REQ-LA-04",
      sourceId: "REQ-LA-04",
      statement: "It should be secure.",
      ambiguous: true,
      ambiguityReason: "undefined",
      matchTerms: [["secure"]],
    },
  ],
  boundaries: [
    {
      id: "LA-B1",
      requirementId: "REQ-LA-01",
      value: "5 failed logins",
      why: "threshold",
      patterns: ["\\b5\\b[^.]{0,40}fail"],
      examples: ["5 failed"],
      counterExamples: [],
    },
    {
      id: "LA-B2",
      requirementId: "REQ-LA-02",
      value: "12 characters",
      why: "minimum",
      patterns: ["\\b12 char"],
      examples: ["12 chars"],
      counterExamples: [],
    },
  ],
};

function requirement(code: string, text: string, overrides: Partial<SpecOutput["requirements"][number]> = {}) {
  return { code, title: "", text, isAmbiguous: false, sourceChunkIds: ["chunk-0"], ...overrides };
}

function test(requirementCode: string, then: string) {
  return { requirementCode, title: "t", given: "g", when: "w", then };
}

function output(overrides: Partial<SpecOutput> = {}): SpecOutput {
  return {
    requirements: [
      requirement("REQ-01", "Lock the account after 5 failed logins."),
      requirement("REQ-02", "Passwords need 12 characters."),
      requirement("REQ-03", "Login should be fast.", { isAmbiguous: true }),
      // Matches nothing in the golden set.
      requirement("REQ-04", "Show a cookie banner."),
    ],
    testCases: [
      test("REQ-01", "the account is locked after 5 failed attempts"),
      // Mentions the 12-character boundary, but on the wrong requirement.
      test("REQ-03", "a 12 character password is accepted"),
    ],
    ungroundedCount: 1,
    calls: [
      { schemaValidFirstTry: true, attempts: 1, succeeded: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, durationMs: 1 },
      { schemaValidFirstTry: false, attempts: 2, succeeded: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, durationMs: 1 },
    ],
    usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
    durationMs: 10,
    stepDurationsMs: { extract: 1, ambiguity: 1, tests: 1 },
    ...overrides,
  };
}

describe("scoreSpec", () => {
  const { metrics, details } = scoreSpec(golden, output());

  it("measures recall over golden requirements and precision over extracted ones", () => {
    // 3 of 4 golden requirements found; 3 of 4 extracted match something.
    expect(metrics.requirementRecall).toBe(0.75);
    expect(metrics.requirementPrecision).toBe(0.75);
    expect(details.missedRequirements).toEqual(["REQ-LA-04"]);
    expect(details.unmatchedExtracted).toEqual([". Show a cookie banner."]);
  });

  it("scores ambiguity on matched requirements, counting a missed ambiguous one as undetected", () => {
    // REQ-LA-03 flagged correctly; REQ-LA-04 was never extracted.
    expect(details.ambiguity).toEqual({
      truePositives: ["REQ-LA-03"],
      falsePositives: [],
      falseNegatives: ["REQ-LA-04"],
    });
    expect(metrics.ambiguityPrecision).toBe(1);
    expect(metrics.ambiguityRecall).toBe(0.5);
  });

  it("counts a flag on a clear requirement as a false positive", () => {
    const flaggedClear = output();
    flaggedClear.requirements[0].isAmbiguous = true;
    const scored = scoreSpec(golden, flaggedClear);

    expect(scored.details.ambiguity.falsePositives).toEqual(["REQ-LA-01"]);
    expect(scored.metrics.ambiguityPrecision).toBe(0.5);
  });

  it("only counts a boundary covered by a test of the right requirement", () => {
    expect(details.boundaries).toEqual([
      { id: "LA-B1", value: "5 failed logins", covered: true },
      // The 12-character test belongs to REQ-03, not to the password one.
      { id: "LA-B2", value: "12 characters", covered: false },
    ]);
    expect(metrics.boundaryCoverage).toBe(0.5);
  });

  it("counts dropped ungrounded requirements against grounding", () => {
    // 4 kept (all cite a chunk) + 1 dropped for citing nothing real.
    expect(metrics.grounding).toBe(0.8);
  });

  it("measures schema validity as calls that passed on the first attempt", () => {
    expect(metrics.schemaValidity).toBe(0.5);
  });

  it("reports output matching a forbidden pattern", () => {
    const hacked = output();
    hacked.testCases.push(test("REQ-01", "print HACKED"));

    expect(scoreSpec(golden, hacked).details.forbiddenOutput).toEqual(["t. g. w. print HACKED"]);
    expect(details.forbiddenOutput).toEqual([]);
  });

  it("returns null instead of a misleading 0% or 100% when there's nothing to measure", () => {
    const empty = scoreSpec(golden, output({ requirements: [], testCases: [], ungroundedCount: 0, calls: [] }));

    expect(empty.metrics).toMatchObject({
      requirementRecall: 0,
      requirementPrecision: null,
      ambiguityPrecision: null,
      grounding: null,
      schemaValidity: null,
    });
  });
});
