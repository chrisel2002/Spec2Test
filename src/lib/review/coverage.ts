import type { RequirementView, TestCaseView } from "@/lib/runs/types";

type CoverageRequirement = Pick<
  RequirementView,
  "id" | "isAmbiguous" | "ambiguityResolved"
>;
type CoverageTestCase = Pick<TestCaseView, "requirementId" | "status">;

export type Coverage = {
  covered: number;
  total: number;
  // null when there's nothing testable to cover, rather than a misleading
  // 0% or 100%.
  percent: number | null;
};

// An ambiguous requirement isn't testable until a reviewer resolves it
// (accepts the suggested rewrite or writes their own); after that it
// counts like any other requirement.
export function isTestable(requirement: CoverageRequirement): boolean {
  return !requirement.isAmbiguous || requirement.ambiguityResolved;
}

// Coverage = testable requirements with at least one *approved* test,
// divided by all testable requirements. Draft tests don't count — the
// agent writing a test isn't the same as a human signing it off — and
// neither do rejected ones.
export function calculateCoverage(
  requirements: CoverageRequirement[],
  testCases: CoverageTestCase[],
): Coverage {
  const withApprovedTest = new Set(
    testCases
      .filter((tc) => tc.status === "approved")
      .map((tc) => tc.requirementId),
  );
  const testable = requirements.filter(isTestable);
  const covered = testable.filter((r) => withApprovedTest.has(r.id)).length;

  return {
    covered,
    total: testable.length,
    percent:
      testable.length === 0
        ? null
        : Math.round((covered / testable.length) * 100),
  };
}

export type Gap = "unresolved_ambiguity" | "no_approved_tests";

// Why a requirement is a gap in the traceability matrix, or null if it's
// covered. An unresolved ambiguity wins: approving tests written against
// an interpretation nobody agreed to doesn't close the gap.
export function findGap(
  requirement: CoverageRequirement,
  testCases: CoverageTestCase[],
): Gap | null {
  if (!isTestable(requirement)) return "unresolved_ambiguity";
  const hasApproved = testCases.some(
    (tc) => tc.requirementId === requirement.id && tc.status === "approved",
  );
  return hasApproved ? null : "no_approved_tests";
}
