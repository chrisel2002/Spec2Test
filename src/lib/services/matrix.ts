import "server-only";

import { calculateCoverage, type Coverage, isTestable } from "@/lib/review/coverage";
import {
  buildMatrixRows,
  countGaps,
  type MatrixFilter,
  type MatrixRow,
} from "@/lib/review/matrix";
import type { RequirementView, RunSummary, TestCaseStatus } from "@/lib/runs/types";

import { getRun } from "./runs";

export type RequirementWithCounts = RequirementView & {
  testable: boolean;
  tests: Record<TestCaseStatus, number>;
};

// A run's requirements with their ambiguity details and test counts per
// review status.
export async function getRequirements(runId: string): Promise<{
  run: RunSummary;
  requirements: RequirementWithCounts[];
}> {
  const detail = await getRun(runId);
  const requirements = detail.requirements.map((requirement) => {
    const tests = { draft: 0, approved: 0, rejected: 0 };
    for (const tc of detail.testCases) {
      if (tc.requirementId === requirement.id) tests[tc.status] += 1;
    }
    return { ...requirement, testable: isTestable(requirement), tests };
  });
  return { run: detail.run, requirements };
}

export type TraceabilityMatrix = {
  run: RunSummary;
  coverage: Coverage;
  gaps: ReturnType<typeof countGaps>;
  rows: MatrixRow[];
};

// The same matrix the web app's tab shows, built by the same pure
// functions (buildMatrixRows, calculateCoverage), for the exporters and
// the MCP server. Coverage and gap counts always cover every requirement;
// the filter only narrows the rows.
export async function getTraceabilityMatrix(
  runId: string,
  filter: MatrixFilter = { status: "all", gapsOnly: false },
): Promise<TraceabilityMatrix> {
  const detail = await getRun(runId);
  const allRows = buildMatrixRows(detail.requirements, detail.testCases, {
    status: "all",
    gapsOnly: false,
  });
  return {
    run: detail.run,
    coverage: calculateCoverage(detail.requirements, detail.testCases),
    gaps: countGaps(allRows),
    rows:
      filter.status === "all" && !filter.gapsOnly
        ? allRows
        : buildMatrixRows(detail.requirements, detail.testCases, filter),
  };
}
