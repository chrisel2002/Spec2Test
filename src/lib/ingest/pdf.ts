import { extractText, getDocumentProxy } from "unpdf";

import { normalizeLineEndings } from "./text";
import { IngestInputError, MAX_PDF_PAGES } from "./validate";
import type { ParsedDocument } from "./types";

const SECTION_HEADING = /^\d+\.\s+\S/;
// "REQ-1.2:" and "REQ-LA-02:" alike.
const REQUIREMENT_HEADING = /^REQ-[\w.-]+:\s/;

// PDF text has no semantic heading markup, so headings are detected by
// matching the numbering conventions used in our requirement-spec sample
// documents ("1. Section title", "REQ-1.2: Requirement title"), plus the
// document's first line as the title. This is specific to our document
// format rather than a general-purpose structure extractor.
//
// A more format-agnostic approach would detect headings by relative font
// size using pdf.js's structured text-item API (extractTextItems), which
// we tried first — but that API's response doesn't survive structured
// clone under Vitest's test environment (DataCloneError from pdf.js's
// Node worker shim), even though it works fine outside tests. Plain text
// extraction (extractText) doesn't hit that issue, so we use it here.
//
// Note: pdf.js's Node worker shim treats `data` as a transferable, which
// detaches its underlying buffer after use — pass a fresh Uint8Array (e.g.
// from a new readFile call) on every call, never a buffer reused from a
// previous parsePdf() call, or the second call throws DataCloneError.
export async function parsePdf(
  data: Uint8Array,
  { maxPages = MAX_PDF_PAGES }: { maxPages?: number } = {},
): Promise<ParsedDocument> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(data);
  } catch (error) {
    const encrypted = error instanceof Error && error.name === "PasswordException";
    throw new IngestInputError(
      encrypted
        ? "This PDF is password-protected. Remove the password and upload it again."
        : "This PDF couldn't be read; it may be damaged. Try exporting it again.",
    );
  }
  // Checked before extracting any text, so a huge document is refused
  // cheaply instead of being parsed and chunked first.
  if (pdf.numPages > maxPages) {
    throw new IngestInputError(
      `This PDF has ${pdf.numPages} pages; the limit is ${maxPages}. Split it into smaller specs.`,
    );
  }

  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];
  if (pageTexts.every((page) => page.trim() === "")) {
    throw new IngestInputError(
      "This PDF has no text layer (it may be a scanned image). Upload a PDF with selectable text, or the Markdown source.",
    );
  }

  const textParts: string[] = [];
  const headings: ParsedDocument["headings"] = [];
  const pages: ParsedDocument["pages"] = [];
  let charIndex = 0;
  let sawTitle = false;

  pageTexts.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    pages.push({ pageNumber, charIndex });

    for (const line of normalizeLineEndings(pageText).split("\n")) {
      if (line.trim() === "") continue;

      if (!sawTitle) {
        headings.push({ level: 1, text: line, charIndex, page: pageNumber });
        sawTitle = true;
      } else if (SECTION_HEADING.test(line)) {
        headings.push({ level: 2, text: line, charIndex, page: pageNumber });
      } else if (REQUIREMENT_HEADING.test(line)) {
        headings.push({ level: 3, text: line, charIndex, page: pageNumber });
      }

      textParts.push(line);
      charIndex += line.length + 1; // +1 for the newline joining lines
    }
  });

  return { text: textParts.join("\n"), headings, pages };
}
