// Pure text helpers for voice output. No server-only import: stripCitations
// runs in the browser (chat answers live in client state).

// Removes citation markers like "[1]", "[2][3]" or "[1, 2]" so the voice
// doesn't read "bracket one bracket" aloud, then tidies the whitespace the
// markers leave behind (e.g. "logs out [1]." -> "logs out.").
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type RunSummaryCounts = {
  requirementCount: number;
  ambiguousCount: number;
  testCaseCount: number;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Built from database counts with a template, not an LLM call: the numbers
// must be exact, and a template is free, instant, and deterministic.
export function buildRunSummary({
  requirementCount,
  ambiguousCount,
  testCaseCount,
}: RunSummaryCounts): string {
  if (requirementCount === 0) {
    return "No requirements have been extracted from this document yet.";
  }

  return [
    `${plural(requirementCount, "requirement", "requirements")} found.`,
    `${ambiguousCount} ${ambiguousCount === 1 ? "is" : "are"} ambiguous.`,
    `${plural(testCaseCount, "test case", "test cases")} generated.`,
  ].join(" ");
}
