import { describe, expect, it } from "vitest";

import { buildMatrixCsv, CSV_HEADER, escapeCsvCell } from "@/lib/export/csv";

import { exportRun } from "./fixtures/export-run";

const input = { detail: exportRun(), documentFilename: "checkout.md" };

// A minimal RFC 4180 reader, so tests assert on parsed cells rather than
// on hand-escaped strings that could share the exporter's mistakes.
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && csv[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else {
      cell += char;
    }
  }
  return rows;
}

function rowsOf(csv: string) {
  const [header, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ""));
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i]])));
}

describe("escapeCsvCell", () => {
  it("leaves plain text alone", () => {
    expect(escapeCsvCell("Shows the total")).toBe("Shows the total");
  });

  it("quotes cells with commas, quotes, or line breaks and doubles inner quotes", () => {
    expect(escapeCsvCell("a, b")).toBe('"a, b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(escapeCsvCell("line 1\r\nline 2")).toBe('"line 1\r\nline 2"');
  });

  it("defuses cells Excel would run as formulas", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-2")).toBe("'-2");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });
});

describe("buildMatrixCsv", () => {
  const csv = buildMatrixCsv(input);

  it("starts with a UTF-8 BOM so Excel reads € correctly", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(Buffer.from(csv, "utf8").subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv).toContain("€19.98");
  });

  it("uses CRLF row endings and the expected header", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parseCsv(csv.slice(1))[0]).toEqual(CSV_HEADER);
  });

  it("round-trips commas, quotes, and multi-line steps as single cells", () => {
    const [first] = rowsOf(csv);

    expect(first["Requirement title"]).toBe("Order total, with VAT");
    expect(first["Requirement text"]).toBe(
      'The cart shall show the total in € with a "VAT included" note.',
    );
    expect(first.Then).toBe('the total reads "€19.98"\nand a "VAT included" note is shown');
  });

  it("writes one row per test case with readable test ids", () => {
    const rows = rowsOf(csv);

    expect(rows.map((r) => r["Test case ID"])).toEqual([
      "REQ-01-T1",
      "REQ-01-T2",
      "REQ-02-T1",
      "REQ-03-T1",
    ]);
    expect(rows[1]["Test title"]).toBe("'=SUM(A1) is shown as text");
  });

  it("shows the original text, the ambiguity, and the reviewer's resolved text", () => {
    const req2 = rowsOf(csv).find((r) => r["Requirement ID"] === "REQ-02");

    expect(req2).toMatchObject({
      "Requirement text": "Checkout should be fast.",
      Ambiguous: "yes",
      "Ambiguity reason": 'Uses "fast" without a threshold.',
      "Resolved text": "Checkout shall complete within 2 seconds for 95% of orders.",
    });
  });

  it("keeps only approved tests when approvedOnly is set", () => {
    const rows = rowsOf(buildMatrixCsv(input, { approvedOnly: true }));

    expect(rows.map((r) => [r["Requirement ID"], r["Test case ID"], r.Status])).toEqual([
      ["REQ-01", "REQ-01-T1", "approved"],
      // REQ-02 has no approved test: kept, with empty test columns, as a gap.
      ["REQ-02", "", ""],
      ["REQ-03", "REQ-03-T1", "approved"],
    ]);
  });

  it("lists a requirement without tests on its own row", () => {
    const detail = exportRun();
    detail.testCases = detail.testCases.filter((tc) => tc.requirementId !== "r1");
    const rows = rowsOf(buildMatrixCsv({ ...input, detail }));

    expect(rows[0]).toMatchObject({ "Requirement ID": "REQ-01", "Test case ID": "", Given: "" });
  });
});
