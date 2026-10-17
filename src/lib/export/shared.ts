import type { RequirementView, RunDetail, TestCaseView } from "@/lib/runs/types";

// Pure helpers shared by every exporter. Exporters take a RunDetail (plus
// the document's filename) and return text, with no DB or file access, so
// they're trivially unit-testable.

export type ExportInput = { detail: RunDetail; documentFilename: string };

export type RequirementWithTests = {
  requirement: RequirementView;
  // Each test with a readable id, e.g. "REQ-03-T2", stable for a run because
  // tests come back in a fixed order (see getRunDetail).
  testCases: (TestCaseView & { label: string })[];
};

export function groupTestsByRequirement(detail: RunDetail): RequirementWithTests[] {
  return detail.requirements.map((requirement) => ({
    requirement,
    testCases: detail.testCases
      .filter((tc) => tc.requirementId === requirement.id)
      .map((tc, i) => ({ ...tc, label: `${requirement.code}-T${i + 1}` })),
  }));
}

// The wording the model extracted, even after a reviewer rewrote it.
export function originalText(requirement: RequirementView): string {
  return requirement.originalText ?? requirement.text;
}

// The reviewer's rewrite, or "" if the requirement was never resolved.
export function resolvedText(requirement: RequirementView): string {
  return requirement.ambiguityResolved ? requirement.text : "";
}

// "Login & Account.md" -> "login-account"
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.(md|pdf)$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "spec"
  );
}
