import { describe, expect, it } from "vitest";

import { buildMatrixRows, countGaps } from "@/lib/review/matrix";
import type { RequirementView, TestCaseStatus, TestCaseView } from "@/lib/runs/types";

function requirement(id: string, isAmbiguous = false): RequirementView {
  return {
    id,
    code: id.toUpperCase(),
    title: id,
    text: "text",
    isAmbiguous,
    ambiguityReason: isAmbiguous ? "vague" : null,
    suggestedRewrite: isAmbiguous ? "rewrite" : null,
    ambiguityResolved: false,
    originalText: null,
  };
}

function testCase(id: string, requirementId: string, status: TestCaseStatus): TestCaseView {
  return {
    id,
    requirementId,
    title: id,
    type: "positive",
    given: "g",
    when: "w",
    then: "t",
    status,
    basedOnAssumption: false,
    updatedAt: "2026-10-17T10:00:00.000Z",
  };
}

// r1: covered. r2: drafts only (gap). r3: ambiguous (gap). r4: no tests (gap).
const requirements = [requirement("r1"), requirement("r2"), requirement("r3", true), requirement("r4")];
const testCases = [
  testCase("t1", "r1", "approved"),
  testCase("t2", "r1", "rejected"),
  testCase("t3", "r2", "draft"),
  testCase("t4", "r3", "approved"),
];

describe("buildMatrixRows", () => {
  it("returns one row per requirement with its linked tests and gap", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "all", gapsOnly: false });

    expect(rows.map((r) => [r.requirement.id, r.testCases.map((t) => t.id), r.gap])).toEqual([
      ["r1", ["t1", "t2"], null],
      ["r2", ["t3"], "no_approved_tests"],
      ["r3", ["t4"], "unresolved_ambiguity"],
      ["r4", [], "no_approved_tests"],
    ]);
  });

  it("keeps only gaps when gapsOnly is set", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "all", gapsOnly: true });

    expect(rows.map((r) => r.requirement.id)).toEqual(["r2", "r3", "r4"]);
  });

  it("filters tests by status and hides rows with no test in that status", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "approved", gapsOnly: false });

    expect(rows.map((r) => [r.requirement.id, r.testCases.map((t) => t.id)])).toEqual([
      ["r1", ["t1"]],
      ["r3", ["t4"]],
    ]);
  });

  it("judges gaps on all tests, not just the filtered ones", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "rejected", gapsOnly: false });

    // r1 is shown for its rejected test but is still covered by t1.
    expect(rows).toEqual([expect.objectContaining({ gap: null })]);
  });

  it("combines both filters", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "draft", gapsOnly: true });

    expect(rows.map((r) => r.requirement.id)).toEqual(["r2"]);
  });
});

describe("countGaps", () => {
  it("counts each kind of gap", () => {
    const rows = buildMatrixRows(requirements, testCases, { status: "all", gapsOnly: false });

    expect(countGaps(rows)).toEqual({ no_approved_tests: 2, unresolved_ambiguity: 1 });
  });
});
