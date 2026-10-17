import { describe, expect, it } from "vitest";

import { exportAvailability } from "@/lib/export/availability";

import { exportRun } from "./fixtures/export-run";

describe("exportAvailability", () => {
  it("allows every export for a completed run with approved tests", () => {
    const detail = exportRun();

    expect(exportAvailability(detail, "csv")).toEqual({ enabled: true });
    expect(exportAvailability(detail, "csv", { approvedOnly: true })).toEqual({ enabled: true });
    expect(exportAvailability(detail, "playwright")).toEqual({ enabled: true });
    expect(exportAvailability(detail, "report")).toEqual({ enabled: true });
  });

  it.each([
    ["running", /still running/],
    ["waiting_for_review", /Build matrix/],
    ["failed", /failed/],
  ] as const)("refuses every export while the run is %s", (status, reason) => {
    const detail = exportRun({ status });

    for (const format of ["csv", "playwright", "report"] as const) {
      const availability = exportAvailability(detail, format);
      expect(availability.enabled).toBe(false);
      if (!availability.enabled) expect(availability.reason).toMatch(reason);
    }
  });

  it("needs an approved test for Playwright and the approved-only CSV, not for the rest", () => {
    const detail = exportRun();
    detail.testCases = detail.testCases.map((tc) => ({ ...tc, status: "draft" as const }));

    expect(exportAvailability(detail, "playwright")).toMatchObject({ enabled: false });
    expect(exportAvailability(detail, "csv", { approvedOnly: true })).toMatchObject({ enabled: false });
    expect(exportAvailability(detail, "csv")).toEqual({ enabled: true });
    expect(exportAvailability(detail, "report")).toEqual({ enabled: true });
  });

  it("refuses a run with no requirements", () => {
    const detail = exportRun();
    detail.requirements = [];
    detail.testCases = [];

    expect(exportAvailability(detail, "report")).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/no requirements/),
    });
  });
});
