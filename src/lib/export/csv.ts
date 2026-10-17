import { groupTestsByRequirement, type ExportInput, originalText, resolvedText } from "./shared";

export const CSV_HEADER = [
  "Requirement ID",
  "Requirement title",
  "Requirement text",
  "Ambiguous",
  "Ambiguity reason",
  "Resolved text",
  "Test case ID",
  "Test title",
  "Type",
  "Status",
  "Given",
  "When",
  "Then",
];

// Excel only reads a CSV as UTF-8 (so "€" isn't garbled into "â‚¬") when the
// file starts with a byte order mark.
const UTF8_BOM = "\uFEFF";

// One cell, per RFC 4180: a value containing a quote, comma, or line break
// is wrapped in quotes, and quotes inside it are doubled. Line breaks stay
// inside the quotes, so a multi-line step remains one cell.
//
// Also defuses CSV formula injection: a cell starting with = + - @ (or a
// tab/CR) is run as a formula by Excel, so requirement text from an
// uploaded spec could otherwise execute in the reviewer's spreadsheet.
// A leading apostrophe makes Excel treat it as text, as OWASP recommends.
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsvLine(cells: string[]): string {
  return cells.map(escapeCsvCell).join(",");
}

// The traceability matrix as CSV: one row per test case, plus one row with
// empty test columns for each requirement that has no (matching) tests, so
// gaps are visible in the spreadsheet too. approvedOnly keeps only
// approved tests.
export function buildMatrixCsv(
  { detail }: ExportInput,
  { approvedOnly = false }: { approvedOnly?: boolean } = {},
): string {
  const lines = [toCsvLine(CSV_HEADER)];

  for (const { requirement, testCases } of groupTestsByRequirement(detail)) {
    const requirementCells = [
      requirement.code,
      requirement.title,
      originalText(requirement),
      requirement.isAmbiguous ? "yes" : "no",
      requirement.ambiguityReason ?? "",
      resolvedText(requirement),
    ];
    const included = approvedOnly
      ? testCases.filter((tc) => tc.status === "approved")
      : testCases;

    if (included.length === 0) {
      lines.push(toCsvLine([...requirementCells, "", "", "", "", "", "", ""]));
      continue;
    }
    for (const tc of included) {
      lines.push(
        toCsvLine([
          ...requirementCells,
          tc.label,
          tc.title,
          tc.type,
          tc.status,
          tc.given,
          tc.when,
          tc.then,
        ]),
      );
    }
  }

  // CRLF line endings, as RFC 4180 specifies and Excel expects.
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
