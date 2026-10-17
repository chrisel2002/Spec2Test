import { describe, expect, it } from "vitest";

import { runReducer, type RunState } from "@/lib/runs/reducer";
import type {
  RequirementView,
  RunDetail,
  StepView,
  TestCaseView,
} from "@/lib/runs/types";

function requirement(id: string, overrides: Partial<RequirementView> = {}): RequirementView {
  return {
    id,
    code: `REQ-${id}`,
    title: `Requirement ${id}`,
    text: "The system shall do something.",
    isAmbiguous: false,
    ambiguityReason: null,
    suggestedRewrite: null,
    ambiguityResolved: false,
    originalText: null,
    ...overrides,
  };
}

function testCase(id: string, overrides: Partial<TestCaseView> = {}): TestCaseView {
  return {
    id,
    requirementId: "r1",
    title: `Test ${id}`,
    type: "positive",
    given: "g",
    when: "w",
    then: "t",
    status: "draft",
    basedOnAssumption: false,
    updatedAt: "2026-10-17T10:00:00.000Z",
    ...overrides,
  };
}

function step(id: string, overrides: Partial<StepView> = {}): StepView {
  return {
    id,
    step: "generate_tests",
    status: "running",
    error: null,
    costUsd: null,
    startedAt: "2026-10-17T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run: {
      id: "run-1",
      documentId: "doc-1",
      status: "running",
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
    ...overrides,
  };
}

const initial: RunState = { detail: detail(), progress: {} };

describe("runReducer", () => {
  it("appends requirements as batches stream in, keeping their order", () => {
    let state = runReducer(initial, { type: "requirements", requirements: [requirement("1")] });
    state = runReducer(state, {
      type: "requirements",
      requirements: [requirement("2"), requirement("3")],
    });

    expect(state.detail?.requirements.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("updates an existing requirement in place instead of duplicating it", () => {
    const state = runReducer(
      { ...initial, detail: detail({ requirements: [requirement("1"), requirement("2")] }) },
      {
        type: "requirements",
        requirements: [requirement("1", { isAmbiguous: true, ambiguityReason: "vague" })],
      },
    );

    expect(state.detail?.requirements).toHaveLength(2);
    expect(state.detail?.requirements[0]).toMatchObject({ id: "1", isAmbiguous: true });
  });

  it("is idempotent: applying the same event twice gives the same state", () => {
    const event = { type: "testCases" as const, testCases: [testCase("t1")] };
    const once = runReducer(initial, event);
    const twice = runReducer(once, event);

    expect(twice).toEqual(once);
  });

  it("tracks progress per step and clears it when the step finishes", () => {
    let state = runReducer(initial, { type: "progress", step: "generate_tests", done: 5, total: 12 });
    expect(state.progress.generate_tests).toEqual({ done: 5, total: 12 });

    state = runReducer(state, { type: "step", step: step("s1", { status: "succeeded" }) });
    expect(state.progress.generate_tests).toBeUndefined();
  });

  it("keeps progress while a step reports it is still running", () => {
    let state = runReducer(initial, { type: "progress", step: "generate_tests", done: 5, total: 12 });
    state = runReducer(state, { type: "step", step: step("s1", { status: "running" }) });

    expect(state.progress.generate_tests).toEqual({ done: 5, total: 12 });
  });

  it("replaces everything with a snapshot and drops stale progress", () => {
    const withProgress = runReducer(initial, {
      type: "progress",
      step: "extract_requirements",
      done: 1,
      total: 4,
    });
    const snapshot = detail({ requirements: [requirement("9")] });
    const state = runReducer(withProgress, { type: "snapshot", detail: snapshot });

    expect(state).toEqual({ detail: snapshot, progress: {} });
  });

  it("updates the run's status", () => {
    const state = runReducer(initial, {
      type: "run",
      run: { ...initial.detail!.run, status: "waiting_for_review" },
    });

    expect(state.detail?.run.status).toBe("waiting_for_review");
  });

  it("ignores row events when no run is loaded", () => {
    const empty: RunState = { detail: null, progress: {} };

    expect(runReducer(empty, { type: "testCases", testCases: [testCase("t1")] })).toBe(empty);
  });
});
