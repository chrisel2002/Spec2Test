import { extractText, getDocumentProxy } from "unpdf";

import { normalizeLineEndings } from "./text";
import type { ParsedDocument } from "./types";

const SECTION_HEADING = /^\d+\.\s+\S/;
const REQUIREMENT_HEADING = /^REQ-[\w.]+:\s/;

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
export async function parsePdf(data: Uint8Array): Promise<ParsedDocument> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];

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
