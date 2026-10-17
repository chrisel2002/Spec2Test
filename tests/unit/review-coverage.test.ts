import { describe, expect, it } from "vitest";

import {
  calculateCoverage,
  findGap,
  isTestable,
} from "@/lib/review/coverage";
import type { TestCaseStatus } from "@/lib/runs/types";

function req(id: string, overrides: { isAmbiguous?: boolean; ambiguityResolved?: boolean } = {}) {
  return {
    id,
    isAmbiguous: overrides.isAmbiguous ?? false,
    ambiguityResolved: overrides.ambiguityResolved ?? false,
  };
}

function test(requirementId: string, status: TestCaseStatus) {
  return { requirementId, status };
}

describe("isTestable", () => {
  it("treats a clear requirement as testable", () => {
    expect(isTestable(req("r1"))).toBe(true);
  });

  it("treats an unresolved ambiguous requirement as not testable", () => {
    expect(isTestable(req("r1", { isAmbiguous: true }))).toBe(false);
  });

  it("treats an ambiguous requirement as testable once a reviewer resolved it", () => {
    expect(isTestable(req("r1", { isAmbiguous: true, ambiguityResolved: true }))).toBe(true);
  });
});

describe("calculateCoverage", () => {
  it("counts testable requirements with at least one approved test", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2"), req("r3"), req("r4")],
      [test("r1", "approved"), test("r2", "approved"), test("r3", "draft")],
    );

    expect(coverage).toEqual({ covered: 2, total: 4, percent: 50 });
  });

  it("does not count draft or rejected tests as coverage", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2")],
      [test("r1", "draft"), test("r2", "rejected")],
    );

    expect(coverage).toEqual({ covered: 0, total: 2, percent: 0 });
  });

  it("counts a requirement once no matter how many approved tests it has", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2")],
      [test("r1", "approved"), test("r1", "approved"), test("r1", "approved")],
    );

    expect(coverage).toEqual({ covered: 1, total: 2, percent: 50 });
  });

  it("leaves unresolved ambiguous requirements out of the denominator", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2", { isAmbiguous: true })],
      [test("r1", "approved"), test("r2", "approved")],
    );

    // r2's approved test doesn't count: it tests an unagreed assumption.
    expect(coverage).toEqual({ covered: 1, total: 1, percent: 100 });
  });

  it("includes resolved ambiguous requirements like any other", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2", { isAmbiguous: true, ambiguityResolved: true })],
      [test("r1", "approved")],
    );

    expect(coverage).toEqual({ covered: 1, total: 2, percent: 50 });
  });

  it("returns a null percentage when nothing is testable, rather than 0% or 100%", () => {
    expect(calculateCoverage([], [])).toEqual({ covered: 0, total: 0, percent: null });
    expect(
      calculateCoverage([req("r1", { isAmbiguous: true })], []),
    ).toEqual({ covered: 0, total: 0, percent: null });
  });

  it("rounds to a whole percentage", () => {
    const coverage = calculateCoverage(
      [req("r1"), req("r2"), req("r3")],
      [test("r1", "approved")],
    );

    expect(coverage.percent).toBe(33);
  });

  it("ignores tests linked to requirements that aren't in the list", () => {
    const coverage = calculateCoverage([req("r1")], [test("other", "approved")]);

    expect(coverage).toEqual({ covered: 0, total: 1, percent: 0 });
  });
});

describe("findGap", () => {
  it("reports no gap for a requirement with an approved test", () => {
    expect(findGap(req("r1"), [test("r1", "approved"), test("r1", "draft")])).toBeNull();
  });

  it("reports a missing approved test", () => {
    expect(findGap(req("r1"), [test("r1", "draft"), test("r1", "rejected")])).toBe(
      "no_approved_tests",
    );
    expect(findGap(req("r1"), [])).toBe("no_approved_tests");
  });

  it("only looks at the requirement's own tests", () => {
    expect(findGap(req("r1"), [test("r2", "approved")])).toBe("no_approved_tests");
  });

  it("reports an unresolved ambiguity even when its tests are approved", () => {
    expect(
      findGap(req("r1", { isAmbiguous: true }), [test("r1", "approved")]),
    ).toBe("unresolved_ambiguity");
  });
});
