import type { StepProgress } from "./reducer";
import { latestSteps } from "./selectors";
import type { RunDetail, StepName } from "./types";

type StepState = "done" | "running" | "waiting" | "failed";

export type PipelineStep = {
  key: "parse_embed" | StepName;
  label: string;
  state: StepState;
  detail: string | null;
  // The run is paused here until a human finishes reviewing.
  needsReview: boolean;
};

type DocumentProgress = {
  status: "embedding" | "waiting" | "failed" | "ready";
  chunkCount: number;
  embeddedCount: number;
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function parseAndEmbed(document: DocumentProgress | null): PipelineStep {
  const base = { key: "parse_embed" as const, label: "Parse and embed", needsReview: false };
  if (!document) return { ...base, state: "waiting", detail: null };

  const { chunkCount, embeddedCount } = document;
  switch (document.status) {
    case "ready":
      return { ...base, state: "done", detail: plural(chunkCount, "chunk") };
    case "embedding":
      return { ...base, state: "running", detail: `Embedding ${embeddedCount}/${chunkCount}` };
    case "waiting":
      return { ...base, state: "waiting", detail: `Paused at ${embeddedCount}/${chunkCount}` };
    case "failed":
      return { ...base, state: "failed", detail: "Embedding failed" };
  }
}

const GRAPH_STEPS: { key: StepName; label: string; verb: string }[] = [
  { key: "extract_requirements", label: "Extract requirements", verb: "Reading sections" },
  { key: "check_ambiguity", label: "Check ambiguity", verb: "Checking" },
  { key: "generate_tests", label: "Generate tests", verb: "Generating tests" },
  { key: "build_matrix", label: "Build matrix", verb: "Building" },
];

// What each step says once it has finished, from the run's own data.
function doneDetail(key: StepName, detail: RunDetail): string | null {
  switch (key) {
    case "extract_requirements":
      return plural(detail.requirements.length, "requirement");
    case "check_ambiguity":
      return `${detail.requirements.filter((r) => r.isAmbiguous).length} ambiguous`;
    case "generate_tests":
      return plural(detail.testCases.length, "test");
    case "build_matrix": {
      const coverage = detail.run.coverage;
      if (!coverage || coverage.total === 0) return null;
      return `${Math.round((coverage.covered / coverage.total) * 100)}% coverage`;
    }
    default:
      return null;
  }
}

// The five steps shown in the sidebar. "Parse and embed" comes from the
// document (ingestion runs at upload, outside the graph); the other four
// come from the selected run's step rows, plus live progress counters.
export function derivePipelineSteps(
  document: DocumentProgress | null,
  detail: RunDetail | null,
  progress: Partial<Record<StepName, StepProgress>>,
): PipelineStep[] {
  const latest = detail ? latestSteps(detail.steps) : {};

  const graphSteps = GRAPH_STEPS.map(({ key, label, verb }): PipelineStep => {
    const base = { key, label, needsReview: false };
    const row = latest[key];

    if (key === "build_matrix" && detail?.run.status === "waiting_for_review") {
      return { ...base, state: "waiting", detail: "Waiting for your review", needsReview: true };
    }
    if (!detail || !row) {
      // Finished without ever reaching this step: it was skipped (e.g. no
      // requirements were found, so there was nothing to check or test).
      const skipped = detail?.run.status === "completed";
      return { ...base, state: "waiting", detail: skipped ? "Skipped" : null };
    }

    switch (row.status) {
      case "running": {
        const p = progress[key];
        return {
          ...base,
          state: "running",
          // Progress is live-only, so right after a reconnect there may be
          // none yet until the node's next batch reports in.
          detail: p && p.total > 0 ? `${verb} ${p.done}/${p.total}` : "Running…",
        };
      }
      case "succeeded":
        return { ...base, state: "done", detail: doneDetail(key, detail) };
      case "failed":
        return { ...base, state: "failed", detail: "Failed" };
      case "pending":
        return { ...base, state: "waiting", detail: null };
    }
  });

  return [parseAndEmbed(document), ...graphSteps];
}
