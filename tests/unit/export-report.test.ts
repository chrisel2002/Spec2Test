import { describe, expect, it } from "vitest";

import { buildReport } from "@/lib/export/report";

import { exportRun } from "./fixtures/export-run";

const runUrl = "http://localhost:3000/?run=11111111-2222-4333-8444-555555555555";
const report = buildReport({ detail: exportRun(), documentFilename: "checkout.md" }, { runUrl });

function section(title: string): string {
  const start = report.indexOf(`## ${title}`);
  const next = report.indexOf("\n## ", start + 1);
  return report.slice(start, next === -1 ? undefined : next);
}

describe("buildReport", () => {
  it("has a title, the run, and a link back to the app", () => {
    expect(report).toMatch(/^# Spec2Test report: checkout\.md\n/);
    expect(report).toContain("Run `11111111` · completed 2026-10-18 09:05 UTC");
    expect(report).toContain(`[Open in Spec2Test](${runUrl})`);
  });

  it("summarises requirements, ambiguity, tests by status, and coverage", () => {
    const summary = section("Summary");

    expect(summary).toContain("| Requirements | 3 |");
    expect(summary).toContain("| Ambiguous | 2 (1 resolved, 1 open) |");
    expect(summary).toContain("| Test cases | 4: 2 approved, 1 draft, 1 rejected |");
    // REQ-01 is covered; REQ-02 (resolved) has only a draft; REQ-03 is
    // still ambiguous, so it isn't testable: 1 of 2.
    expect(summary).toContain("**50%** (1 of 2 testable requirements have an approved test)");
  });

  it("lists the open gaps with their reasons", () => {
    expect(section("Open gaps (2)")).toBe(
      [
        "## Open gaps (2)",
        "",
        "- **REQ-02** Fast checkout: no approved tests",
        '- **REQ-03** Pleasant design: unresolved ambiguity (Uses "pleasant", which is subjective.)',
        "",
      ].join("\n"),
    );
  });

  it("includes the full matrix with every test's type and status", () => {
    const matrix = section("Traceability matrix");

    expect(matrix).toContain("| Requirement | Test cases | Coverage |");
    expect(matrix).toContain(
      "| **REQ-01** Order total, with VAT | REQ-01-T1 Shows the total in € (positive, ✅ approved)<br>REQ-01-T2 =SUM(A1) is shown as text (negative, ❌ rejected) | covered |",
    );
    expect(matrix).toContain("| ⚠️ unresolved ambiguity |");
  });

  it("escapes characters that would break a Markdown table", () => {
    const detail = exportRun();
    detail.requirements[0].title = "A | B <script>";
    detail.testCases[0].title = "two\nlines";
    const escaped = buildReport({ detail, documentFilename: "x.md" }, { runUrl });

    expect(escaped).toContain("**REQ-01** A \\| B &lt;script>");
    expect(escaped).toContain("REQ-01-T1 two<br>lines");
  });

  it("says so when there are no gaps", () => {
    const detail = exportRun();
    detail.requirements = detail.requirements.slice(0, 1);
    const clean = buildReport({ detail, documentFilename: "x.md" }, { runUrl });

    expect(clean).toContain("## Open gaps (0)\n\nNone: every testable requirement has an approved test.");
  });
});
