import { describe, expect, it } from "vitest";

import {
  averageStepDurations,
  costPerRun,
  type StepRow,
  summariseReviews,
} from "@/lib/insights/aggregate";

function row(overrides: Partial<StepRow>): StepRow {
  return {
    runId: "run-1",
    runCreatedAt: new Date("2026-10-18T10:00:00Z"),
    filename: "checkout-spec.md",
    step: "extract_requirements",
    status: "succeeded",
    costUsd: 0.001,
    totalTokens: 1000,
    startedAt: new Date("2026-10-18T10:00:00Z"),
    finishedAt: new Date("2026-10-18T10:00:10Z"),
    ...overrides,
  };
}

describe("costPerRun", () => {
  it("sums cost and tokens per run and step, oldest run first", () => {
    const runs = costPerRun([
      row({ runId: "run-2", runCreatedAt: new Date("2026-10-18T12:00:00Z"), costUsd: 0.005 }),
      row({ step: "extract_requirements" }),
      row({ step: "generate_tests", costUsd: 0.002, totalTokens: 3000 }),
    ]);

    expect(runs.map((r) => r.runId)).toEqual(["run-1", "run-2"]);
    expect(runs[0]).toMatchObject({ costUsd: 0.003, tokens: 4000 });
    expect(runs[0].steps.generate_tests).toEqual({ costUsd: 0.002, tokens: 3000 });
    expect(runs[0].steps.check_ambiguity).toEqual({ costUsd: 0, tokens: 0 });
  });

  it("counts every attempt, since a retried step is paid for twice", () => {
    const [run] = costPerRun([
      row({ status: "failed", costUsd: 0.001 }),
      row({ status: "succeeded", costUsd: 0.001 }),
    ]);

    expect(run.steps.extract_requirements.costUsd).toBeCloseTo(0.002);
  });

  it("treats missing cost or tokens as zero and ignores build_matrix", () => {
    const [run] = costPerRun([
      row({ costUsd: null, totalTokens: null }),
      row({ step: "build_matrix", costUsd: 0.5 }),
    ]);

    expect(run).toMatchObject({ costUsd: 0, tokens: 0 });
  });
});

describe("averageStepDurations", () => {
  it("averages succeeded attempts per step, in pipeline order", () => {
    const durations = averageStepDurations([
      row({ step: "generate_tests", finishedAt: new Date("2026-10-18T10:00:30Z") }),
      row({ step: "extract_requirements" }),
      row({ step: "extract_requirements", finishedAt: new Date("2026-10-18T10:00:20Z") }),
      // Ignored: failed, or never finished.
      row({ step: "check_ambiguity", status: "failed" }),
      row({ step: "check_ambiguity", finishedAt: null }),
    ]);

    expect(durations).toEqual([
      { step: "extract_requirements", averageMs: 15_000, samples: 2 },
      { step: "generate_tests", averageMs: 30_000, samples: 1 },
    ]);
  });
});

describe("summariseReviews", () => {
  it("separates approved as generated, approved after an edit, rejected, and not reviewed", () => {
    const stats = summariseReviews([
      { status: "approved", edited: false },
      { status: "approved", edited: false },
      { status: "approved", edited: true },
      { status: "rejected", edited: false },
      { status: "draft", edited: false },
    ]);

    expect(stats).toEqual({
      generated: 5,
      reviewed: 4,
      approvedAsGenerated: 2,
      approvedAfterEdit: 1,
      rejected: 1,
      notReviewed: 1,
      approvalRate: 0.75,
      acceptedAsIsRate: 0.5,
    });
  });

  it("has no rates until something has been reviewed", () => {
    expect(summariseReviews([{ status: "draft", edited: false }])).toMatchObject({
      approvalRate: null,
      acceptedAsIsRate: null,
    });
  });
});
