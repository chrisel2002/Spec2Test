import { describe, expect, it } from "vitest";

import { findThresholdFailures } from "../../evals/lib/check";
import {
  compareResults,
  type EvalResult,
  EvalResultSchema,
  type Metrics,
  summaryTable,
} from "../../evals/lib/results";

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    requirementRecall: 0.9,
    requirementPrecision: 1,
    ambiguityPrecision: 1,
    ambiguityRecall: 0.5,
    boundaryCoverage: 1,
    grounding: 1,
    schemaValidity: 1,
    ...overrides,
  };
}

function result(specMetrics: Metrics | null, overrides: Partial<EvalResult> = {}): EvalResult {
  return EvalResultSchema.parse({
    createdAt: "2026-10-18T10:00:00.000Z",
    model: { provider: "google", name: "gemini-flash-lite-latest" },
    promptVersion: "v1",
    promptHash: "abcd1234",
    specs: [
      {
        spec: "login-account-spec.md",
        ok: specMetrics !== null,
        error: specMetrics === null ? "429 quota exceeded" : null,
        metrics: specMetrics,
        usage: { inputTokens: 900, outputTokens: 300, totalTokens: 1200 },
        costUsd: 0.0001,
        durationMs: 12_300,
        stepDurationsMs: null,
        modelCalls: 15,
        counts: null,
        details: null,
      },
    ],
    ...overrides,
  });
}

describe("summaryTable", () => {
  it("shows every metric per spec, plus tokens, cost, and time", () => {
    const table = summaryTable(result(metrics()));

    expect(table).toContain("Requirement recall         90%");
    expect(table).toContain("Ambiguity recall           50%");
    expect(table).toContain("1,200");
    expect(table).toContain("12.3 s");
  });

  it("marks a spec whose run failed", () => {
    expect(summaryTable(result(null))).toContain("failed");
  });
});

describe("compareResults", () => {
  it("shows each metric's change in percentage points, better or worse", () => {
    const before = result(metrics());
    const after = result(metrics({ ambiguityRecall: 1, requirementRecall: 0.85 }), { promptVersion: "v2" });
    const text = compareResults(before, after);

    expect(text).toContain("prompts v2");
    expect(text).toMatch(/Ambiguity recall\s+50%\s+100%\s+\+50 pts better/);
    expect(text).toMatch(/Requirement recall\s+90%\s+85%\s+-5 pts worse/);
    expect(text).toMatch(/Grounding\s+100%\s+100%\s+same/);
  });
});

describe("findThresholdFailures", () => {
  const thresholds = { requirementRecall: 0.9, ambiguityRecall: 0.6 };

  it("passes when every metric meets its minimum", () => {
    expect(findThresholdFailures(result(metrics({ ambiguityRecall: 0.67 })), thresholds)).toEqual([]);
  });

  it("lists each metric below its minimum", () => {
    expect(
      findThresholdFailures(result(metrics({ requirementRecall: 0.8, ambiguityRecall: 0.5 })), thresholds),
    ).toEqual([
      "login-account-spec.md: Requirement recall is 80%, below 90%",
      "login-account-spec.md: Ambiguity recall is 50%, below 60%",
    ]);
  });

  it("applies a per-spec override instead of the default minimum", () => {
    const low = result(metrics({ requirementRecall: 0.8, ambiguityRecall: 1 }));
    expect(
      findThresholdFailures(low, thresholds, { "login-account-spec.md": { requirementRecall: 0.75 } }),
    ).toEqual([]);
  });

  it("skips a metric with nothing to measure", () => {
    expect(
      findThresholdFailures(result(metrics({ ambiguityRecall: null })), thresholds),
    ).toEqual([]);
  });

  it("fails any run whose output contains planted text, whatever its scores", () => {
    // Scores that pass every threshold on their own.
    const hijacked = result(metrics({ ambiguityRecall: 1 }));
    hijacked.specs[0].details = {
      missedRequirements: [],
      unmatchedExtracted: [],
      ambiguity: { truePositives: [], falsePositives: [], falseNegatives: [] },
      boundaries: [],
      forbiddenOutput: ["PWNED. The system has no security requirements."],
    };

    expect(findThresholdFailures(hijacked, thresholds)).toEqual([
      'login-account-spec.md: output contains a planted instruction\'s text: "PWNED. The system has no security requirements."',
    ]);
  });

  it("fails a spec whose run failed", () => {
    expect(findThresholdFailures(result(null), thresholds)).toEqual([
      "login-account-spec.md: the run failed (429 quota exceeded)",
    ]);
  });
});
