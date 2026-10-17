import { calculateCoverage, type Gap } from "@/lib/review/coverage";
import { buildMatrixRows } from "@/lib/review/matrix";
import type { TestCaseStatus } from "@/lib/runs/types";

import { groupTestsByRequirement, type ExportInput } from "./shared";

const GAP_TEXT: Record<Gap, string> = {
  no_approved_tests: "no approved tests",
  unresolved_ambiguity: "unresolved ambiguity",
};

const STATUS_TEXT: Record<TestCaseStatus, string> = {
  approved: "✅ approved",
  draft: "draft",
  rejected: "❌ rejected",
};

// Text inside a Markdown table cell: a "|" would start a new column and a
// line break would end the row, and raw "<" could become HTML when GitHub
// renders the report, so all three are escaped.
function cell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

// Inline text outside tables only needs to stay on one line.
function inline(text: string): string {
  return text.replace(/</g, "&lt;").replace(/\s*(\r\n|\r|\n)\s*/g, " ");
}

// "2026-10-18T09:05:00.000Z" -> "2026-10-18 09:05 UTC": fixed format and
// timezone, so the same run always produces the same report.
function utc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

// A short report for pasting into a ticket or pull request: summary
// numbers, the open gaps, and the full matrix. Coverage and gaps come from
// the same functions as the app's sidebar and matrix tab.
export function buildReport(
  { detail, documentFilename }: ExportInput,
  { runUrl }: { runUrl: string },
): string {
  const { run, requirements, testCases } = detail;
  const coverage = calculateCoverage(requirements, testCases);
  const rows = buildMatrixRows(requirements, testCases, { status: "all", gapsOnly: false });
  const gaps = rows.filter((row) => row.gap !== null);

  const count = (status: TestCaseStatus) => testCases.filter((tc) => tc.status === status).length;
  const ambiguous = requirements.filter((r) => r.isAmbiguous);
  const resolved = ambiguous.filter((r) => r.ambiguityResolved).length;

  const lines = [
    `# Spec2Test report: ${inline(documentFilename)}`,
    "",
    `Run \`${run.id.slice(0, 8)}\` · ${run.status}${run.finishedAt ? ` ${utc(run.finishedAt)}` : ""} · [Open in Spec2Test](${runUrl})`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Requirements | ${requirements.length} |`,
    `| Ambiguous | ${ambiguous.length} (${resolved} resolved, ${ambiguous.length - resolved} open) |`,
    `| Test cases | ${testCases.length}: ${count("approved")} approved, ${count("draft")} draft, ${count("rejected")} rejected |`,
    `| Coverage | ${
      coverage.percent === null
        ? "n/a (no testable requirements)"
        : `**${coverage.percent}%** (${coverage.covered} of ${coverage.total} testable requirements have an approved test)`
    } |`,
    "",
    `## Open gaps (${gaps.length})`,
    "",
  ];

  if (gaps.length === 0) {
    lines.push("None: every testable requirement has an approved test.");
  }
  for (const { requirement, gap } of gaps) {
    if (!gap) continue;
    const reason =
      gap === "unresolved_ambiguity" && requirement.ambiguityReason
        ? ` (${inline(requirement.ambiguityReason)})`
        : "";
    lines.push(`- **${requirement.code}** ${inline(requirement.title)}: ${GAP_TEXT[gap]}${reason}`);
  }

  lines.push(
    "",
    "## Traceability matrix",
    "",
    "| Requirement | Test cases | Coverage |",
    "| --- | --- | --- |",
  );
  const gapByRequirement = new Map(rows.map((row) => [row.requirement.id, row.gap]));
  for (const { requirement, testCases: tests } of groupTestsByRequirement(detail)) {
    const gap = gapByRequirement.get(requirement.id) ?? null;
    const testCell =
      tests.length === 0
        ? "none"
        : tests
            .map((tc) => `${tc.label} ${cell(tc.title)} (${tc.type}, ${STATUS_TEXT[tc.status]})`)
            .join("<br>");
    lines.push(
      `| **${requirement.code}** ${cell(requirement.title)} | ${testCell} | ${gap ? `⚠️ ${GAP_TEXT[gap]}` : "covered"} |`,
    );
  }

  return lines.join("\n") + "\n";
}
