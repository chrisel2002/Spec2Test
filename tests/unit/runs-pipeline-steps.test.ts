import { describe, expect, it } from "vitest";

import { derivePipelineSteps } from "@/lib/runs/pipeline-steps";
import { formatUsd, latestSteps, totalCostUsd } from "@/lib/runs/selectors";
import type { RunDetail, StepView } from "@/lib/runs/types";

const readyDocument = { status: "ready" as const, chunkCount: 7, embeddedCount: 7 };

function step(id: string, overrides: Partial<StepView>): StepView {
  return {
    id,
    step: "extract_requirements",
    status: "succeeded",
    error: null,
    costUsd: null,
    startedAt: "2026-10-17T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<RunDetail> & { status?: RunDetail["run"]["status"] } = {}): RunDetail {
  const { status = "running", ...rest } = overrides;
  return {
    run: {
      id: "run-1",
      documentId: "doc-1",
      status,
      error: null,
      rateLimited: false,
      coverage: null,
      createdAt: "2026-10-17T10:00:00.000Z",
      finishedAt: null,
    },
    steps: [],
    requirements: [],
    testCases: [],
    reviewEvents: [],
    ...rest,
  };
}

function states(steps: ReturnType<typeof derivePipelineSteps>) {
  return Object.fromEntries(steps.map((s) => [s.key, s.state]));
}

describe("derivePipelineSteps", () => {
  it("shows five steps, all waiting, before anything has happened", () => {
    const steps = derivePipelineSteps(null, null, {});

    expect(steps.map((s) => s.label)).toEqual([
      "Parse and embed",
      "Extract requirements",
      "Check ambiguity",
      "Generate tests",
      "Build matrix",
    ]);
    expect(steps.every((s) => s.state === "waiting")).toBe(true);
  });

  it("takes Parse and embed from the document's ingestion status", () => {
    const [embedding] = derivePipelineSteps(
      { status: "embedding", chunkCount: 10, embeddedCount: 4 },
      null,
      {},
    );
    expect(embedding).toMatchObject({ state: "running", detail: "Embedding 4/10" });

    const [failed] = derivePipelineSteps({ ...readyDocument, status: "failed" }, null, {});
    expect(failed.state).toBe("failed");
  });

  it("shows in-node progress for the running step", () => {
    const steps = derivePipelineSteps(
      readyDocument,
      detail({
        steps: [
          step("a", { step: "extract_requirements" }),
          step("b", { step: "check_ambiguity" }),
          step("c", { step: "generate_tests", status: "running" }),
        ],
      }),
      { generate_tests: { done: 5, total: 12 } },
    );

    expect(states(steps)).toEqual({
      parse_embed: "done",
      extract_requirements: "done",
      check_ambiguity: "done",
      generate_tests: "running",
      build_matrix: "waiting",
    });
    expect(steps[3].detail).toBe("Generating tests 5/12");
  });

  it("flags Build matrix as waiting for review while the run is paused", () => {
    const steps = derivePipelineSteps(readyDocument, detail({ status: "waiting_for_review" }), {});

    expect(steps[4]).toMatchObject({ state: "waiting", needsReview: true });
  });

  it("uses the latest attempt when a step was retried", () => {
    const steps = derivePipelineSteps(
      readyDocument,
      detail({
        steps: [
          step("a", { step: "extract_requirements", status: "failed" }),
          step("b", { step: "extract_requirements", status: "running" }),
        ],
      }),
      {},
    );

    expect(steps[1].state).toBe("running");
  });

  it("marks steps a completed run never reached as skipped", () => {
    const steps = derivePipelineSteps(
      readyDocument,
      detail({ status: "completed", steps: [step("a", { step: "extract_requirements" })] }),
      {},
    );

    expect(steps[2]).toMatchObject({ state: "waiting", detail: "Skipped" });
  });
});

describe("selectors", () => {
  it("latestSteps keeps the last row per step name", () => {
    const latest = latestSteps([
      step("a", { step: "generate_tests", status: "failed" }),
      step("b", { step: "generate_tests", status: "succeeded" }),
    ]);

    expect(latest.generate_tests?.id).toBe("b");
  });

  it("totalCostUsd sums every attempt, treating missing costs as zero", () => {
    expect(
      totalCostUsd([
        step("a", { costUsd: 0.001 }),
        step("b", { costUsd: null }),
        step("c", { costUsd: 0.0025 }),
      ]),
    ).toBeCloseTo(0.0035);
  });

  it("formatUsd shows sub-cent amounts with enough precision to be non-zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.00042)).toBe("$0.0004");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});
