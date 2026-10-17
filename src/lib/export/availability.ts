import type { RunDetail } from "@/lib/runs/types";

export type ExportFormat = "csv" | "playwright" | "report";

export type Availability = { enabled: true } | { enabled: false; reason: string };

// When each export is allowed, and why not. One function for both sides:
// the matrix tab uses it to disable buttons with an explanation, and the
// export service uses it to refuse the request, so the UI can't offer an
// export the server would reject (or the other way round).
//
// Exports are a record of what was reviewed, so they wait for a completed
// (signed-off) run. Playwright skeletons, and the approved-only CSV, are
// built from approved tests only, so they also need at least one.
export function exportAvailability(
  detail: RunDetail,
  format: ExportFormat,
  options: { approvedOnly?: boolean } = {},
): Availability {
  switch (detail.run.status) {
    case "running":
      return { enabled: false, reason: "The agent is still running." };
    case "waiting_for_review":
      return {
        enabled: false,
        reason: "Finish reviewing and click Build matrix first; exports are a record of the reviewed run.",
      };
    case "failed":
      return { enabled: false, reason: "This run failed. Retry it or start a new run." };
    case "completed":
      break;
  }

  if (detail.requirements.length === 0) {
    return { enabled: false, reason: "This run found no requirements to export." };
  }

  const needsApproved = format === "playwright" || (format === "csv" && options.approvedOnly);
  if (needsApproved && !detail.testCases.some((tc) => tc.status === "approved")) {
    return {
      enabled: false,
      reason: "No tests were approved in this run, and only approved tests are exported.",
    };
  }

  return { enabled: true };
}
