import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePdf } from "@/lib/ingest/pdf";
import { IngestInputError, MAX_SPEC_BYTES, validateSpecFile } from "@/lib/ingest/validate";

const bytes = (text: string) => new TextEncoder().encode(text);
const samplePdf = () =>
  new Uint8Array(readFileSync(join(process.cwd(), "sample-specs/login-account-spec.pdf")));

function rejection(filename: string, data: Uint8Array): string {
  try {
    validateSpecFile(filename, data);
  } catch (error) {
    expect(error).toBeInstanceOf(IngestInputError);
    return (error as Error).message;
  }
  throw new Error("expected the file to be rejected");
}

describe("validateSpecFile", () => {
  it("accepts Markdown text and real PDFs", () => {
    expect(validateSpecFile("spec.md", bytes("# Spec\n\nThe system shall work."))).toEqual({
      mimeType: "text/markdown",
    });
    expect(validateSpecFile("Spec.PDF", samplePdf())).toEqual({ mimeType: "application/pdf" });
  });

  it("rejects other extensions", () => {
    expect(rejection("spec.docx", bytes("x"))).toMatch(/Only Markdown \(\.md\) and PDF/);
  });

  it("rejects empty and whitespace-only files", () => {
    expect(rejection("spec.md", new Uint8Array())).toBe("The file is empty.");
    expect(rejection("spec.md", bytes(" \n\t\n"))).toBe("The file has no text in it.");
  });

  it("rejects files over the size limit", () => {
    expect(rejection("spec.md", new Uint8Array(MAX_SPEC_BYTES + 1))).toMatch(/10 MB/);
  });

  it("checks a .pdf is a PDF by its content, not its name", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(rejection("spec.pdf", png)).toMatch(/named \.pdf but isn't a PDF/);
    expect(rejection("spec.pdf", bytes("# Actually Markdown"))).toMatch(/isn't a PDF/);
  });

  it("names the real type of a binary file renamed to .md", () => {
    expect(rejection("spec.md", samplePdf())).toMatch(/PDF with a \.md name/);
    expect(rejection("spec.md", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toMatch(/ZIP archive/);
    expect(rejection("spec.md", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toMatch(/PNG image/);
  });

  it("rejects invalid UTF-8 and embedded binary data", () => {
    expect(rejection("spec.md", new Uint8Array([0x41, 0xc3, 0x28]))).toMatch(/UTF-8/);
    expect(rejection("spec.md", bytes("text\u0000more"))).toMatch(/binary data/);
  });
});

describe("parsePdf limits", () => {
  it("refuses a PDF with more pages than the limit, before extracting text", async () => {
    // The sample has 3 pages.
    await expect(parsePdf(samplePdf(), { maxPages: 2 })).rejects.toThrow(
      "This PDF has 3 pages; the limit is 2. Split it into smaller specs.",
    );
  });

  it("refuses a damaged PDF with a clear message", async () => {
    await expect(parsePdf(bytes("%PDF-1.7\nthis is not really a pdf"))).rejects.toThrow(
      /couldn't be read; it may be damaged/,
    );
  });

  it("refuses a PDF with no text layer", async () => {
    // A valid one-page PDF with an empty page, so no text to extract.
    const blank = bytes(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    );
    await expect(parsePdf(blank)).rejects.toThrow(/no text layer/);
  });
});
