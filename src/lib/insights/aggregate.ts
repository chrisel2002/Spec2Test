import type { StepName } from "@/lib/runs/types";

// Pure aggregation for the Insights page: raw rows in, chart-ready numbers
// out. Kept separate from the queries so each rule is unit-tested.

export type StepRow = {
  runId: string;
  runCreatedAt: Date;
  filename: string;
  step: StepName;
  status: "pending" | "running" | "succeeded" | "failed";
  costUsd: number | null;
  totalTokens: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

// The steps that call the model, in pipeline order: the cost chart's
// stack order and legend order. build_matrix makes no model call.
export const COST_STEPS = [
  "extract_requirements",
  "check_ambiguity",
  "generate_tests",
  "regenerate_tests",
] as const satisfies readonly StepName[];
export type CostStep = (typeof COST_STEPS)[number];

export const STEP_LABELS: Record<StepName, string> = {
  extract_requirements: "Extract requirements",
  check_ambiguity: "Check ambiguity",
  generate_tests: "Generate tests",
  regenerate_tests: "Regenerate tests",
  build_matrix: "Build matrix",
};

export type RunCost = {
  runId: string;
  createdAt: string;
  filename: string;
  steps: Record<CostStep, { costUsd: number; tokens: number }>;
  costUsd: number;
  tokens: number;
};

// Cost and tokens per run, split by step, oldest run first. Every attempt
// counts, failed ones included: a retried step was paid for twice.
export function costPerRun(rows: StepRow[]): RunCost[] {
  const runs = new Map<string, RunCost>();
  for (const row of rows) {
    let run = runs.get(row.runId);
    if (!run) {
      run = {
        runId: row.runId,
        createdAt: row.runCreatedAt.toISOString(),
        filename: row.filename,
        steps: Object.fromEntries(
          COST_STEPS.map((step) => [step, { costUsd: 0, tokens: 0 }]),
        ) as RunCost["steps"],
        costUsd: 0,
        tokens: 0,
      };
      runs.set(row.runId, run);
    }
    if (!(COST_STEPS as readonly StepName[]).includes(row.step)) continue;
    const step = run.steps[row.step as CostStep];
    step.costUsd += row.costUsd ?? 0;
    step.tokens += row.totalTokens ?? 0;
    run.costUsd += row.costUsd ?? 0;
    run.tokens += row.totalTokens ?? 0;
  }
  return [...runs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type StepDuration = { step: StepName; averageMs: number; samples: number };

// Average wall-clock time per step, over attempts that succeeded (a failed
// attempt's time says more about the failure than about the step).
export function averageStepDurations(rows: StepRow[]): StepDuration[] {
  const order: StepName[] = [
    "extract_requirements",
    "check_ambiguity",
    "generate_tests",
    "regenerate_tests",
    "build_matrix",
  ];
  return order.flatMap((step) => {
    const durations = rows
      .filter((r) => r.step === step && r.status === "succeeded" && r.startedAt && r.finishedAt)
      .map((r) => r.finishedAt!.getTime() - r.startedAt!.getTime());
    if (durations.length === 0) return [];
    const total = durations.reduce((sum, ms) => sum + ms, 0);
    return [{ step, averageMs: total / durations.length, samples: durations.length }];
  });
}

export type ReviewRow = { status: "draft" | "approved" | "rejected"; edited: boolean };

export type ReviewStats = {
  generated: number;
  reviewed: number;
  approvedAsGenerated: number;
  approvedAfterEdit: number;
  rejected: number;
  notReviewed: number;
  // Of the tests a person reviewed, the share they kept (as generated or
  // after editing), and the share they kept without changing a word.
  approvalRate: number | null;
  acceptedAsIsRate: number | null;
};

export function summariseReviews(rows: ReviewRow[]): ReviewStats {
  const approvedAfterEdit = rows.filter((r) => r.status === "approved" && r.edited).length;
  const approvedAsGenerated = rows.filter((r) => r.status === "approved" && !r.edited).length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const reviewed = approvedAsGenerated + approvedAfterEdit + rejected;
  return {
    generated: rows.length,
    reviewed,
    approvedAsGenerated,
    approvedAfterEdit,
    rejected,
    notReviewed: rows.length - reviewed,
    approvalRate: reviewed === 0 ? null : (approvedAsGenerated + approvedAfterEdit) / reviewed,
    acceptedAsIsRate: reviewed === 0 ? null : approvedAsGenerated / reviewed,
  };
}
