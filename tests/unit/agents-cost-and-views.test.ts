import { describe, expect, it } from "vitest";

import { estimateCostUsd } from "@/lib/agents/cost";
import { requireUuid, ServiceError } from "@/lib/services/errors";
import {
  toRequirementView,
  toReviewEventView,
  toRunSummary,
  toStepView,
  toTestCaseView,
} from "@/lib/runs/views";

describe("estimateCostUsd", () => {
  it("prices input and output tokens separately, per million", () => {
    // gemini-flash-lite-latest: $0.0375 in, $0.15 out per million tokens.
    expect(
      estimateCostUsd("gemini-flash-lite-latest", { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.1875);
    expect(
      estimateCostUsd("gemini-flash-lite-latest", { inputTokens: 8_000, outputTokens: 2_000 }),
    ).toBeCloseTo(0.0006);
  });

  it("returns 0 for a model without a known price (e.g. the mock)", () => {
    expect(estimateCostUsd("mock", { inputTokens: 5_000, outputTokens: 5_000 })).toBe(0);
  });
});

describe("requireUuid", () => {
  it("returns a valid id unchanged", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(requireUuid(id, "run")).toBe(id);
  });

  it("throws an 'invalid' ServiceError naming the kind of id", () => {
    expect(() => requireUuid("42", "run")).toThrow(new ServiceError("Invalid run id", "invalid"));
  });
});

describe("row-to-view mappers", () => {
  const at = new Date("2026-10-18T10:00:00.000Z");

  it("turns dates into ISO strings and keeps nullable ones null", () => {
    expect(
      toRunSummary({
        id: "r",
        documentId: "d",
        status: "completed",
        error: null,
        rateLimited: false,
        coverage: { covered: 1, total: 2 },
        createdAt: at,
        finishedAt: null,
        heartbeatAt: at,
      }),
    ).toEqual({
      id: "r",
      documentId: "d",
      status: "completed",
      error: null,
      rateLimited: false,
      coverage: { covered: 1, total: 2 },
      createdAt: "2026-10-18T10:00:00.000Z",
      finishedAt: null,
    });
  });

  it("validates a step's name instead of trusting the column", () => {
    const row = {
      id: "s",
      documentId: "d",
      runId: "r",
      step: "generate_tests",
      status: "succeeded" as const,
      tokenUsage: null,
      costUsd: 0.001,
      startedAt: at,
      finishedAt: at,
      error: null,
    };
    expect(toStepView(row)).toMatchObject({ step: "generate_tests", finishedAt: "2026-10-18T10:00:00.000Z" });
    expect(() => toStepView({ ...row, step: "drop_tables" })).toThrow();
  });

  it("maps requirements, test cases, and review events field by field", () => {
    expect(
      toRequirementView({
        id: "q",
        documentId: "d",
        runId: "r",
        code: "REQ-01",
        title: "T",
        text: "x",
        sourceChunkIds: ["c"],
        isAmbiguous: true,
        ambiguityReason: "vague",
        suggestedRewrite: "y",
        ambiguityResolved: false,
        originalText: null,
        createdAt: at,
      }),
    ).toEqual({
      id: "q",
      code: "REQ-01",
      title: "T",
      text: "x",
      isAmbiguous: true,
      ambiguityReason: "vague",
      suggestedRewrite: "y",
      ambiguityResolved: false,
      originalText: null,
    });

    expect(
      toTestCaseView({
        id: "t",
        requirementId: "q",
        title: "T",
        type: "boundary",
        given: "g",
        when: "w",
        then: "t",
        status: "approved",
        basedOnAssumption: false,
        createdAt: at,
        updatedAt: at,
      }),
    ).toMatchObject({ type: "boundary", status: "approved", updatedAt: "2026-10-18T10:00:00.000Z" });

    expect(
      toReviewEventView({
        id: "e",
        runId: "r",
        requirementId: "q",
        testCaseId: null,
        actor: "Dana",
        action: "requirement_rewritten",
        fromStatus: null,
        toStatus: null,
        changes: null,
        createdAt: at,
      }),
    ).toMatchObject({ actor: "Dana", testCaseId: null, changes: null, createdAt: "2026-10-18T10:00:00.000Z" });
  });
});
