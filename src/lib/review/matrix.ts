import type {
  RequirementView,
  TestCaseStatus,
  TestCaseView,
} from "@/lib/runs/types";

import { findGap, type Gap } from "./coverage";

export type MatrixFilter = {
  status: "all" | TestCaseStatus;
  gapsOnly: boolean;
};

export type MatrixRow = {
  requirement: RequirementView;
  // The requirement's tests that pass the status filter.
  testCases: TestCaseView[];
  // Judged on all of its tests, not just the filtered ones, so filtering
  // the view never changes whether a requirement is a gap.
  gap: Gap | null;
};

// One row per requirement, with its linked tests. A status filter hides
// rows that have no test in that status (a row of nothing isn't useful);
// "gaps only" keeps only requirements that aren't covered.
export function buildMatrixRows(
  requirements: RequirementView[],
  testCases: TestCaseView[],
  filter: MatrixFilter,
): MatrixRow[] {
  return requirements
    .map((requirement) => {
      const linked = testCases.filter((tc) => tc.requirementId === requirement.id);
      return {
        requirement,
        testCases:
          filter.status === "all"
            ? linked
            : linked.filter((tc) => tc.status === filter.status),
        gap: findGap(requirement, linked),
      };
    })
    .filter((row) => !filter.gapsOnly || row.gap !== null)
    .filter((row) => filter.status === "all" || row.testCases.length > 0);
}

export function countGaps(rows: Pick<MatrixRow, "gap">[]): Record<Gap, number> {
  return {
    unresolved_ambiguity: rows.filter((r) => r.gap === "unresolved_ambiguity").length,
    no_approved_tests: rows.filter((r) => r.gap === "no_approved_tests").length,
  };
}
