import type { Heading, Page, ParsedDocument } from "./types";

export type Chunk = {
  content: string;
  heading: string | null;
  headingLevel: number | null;
  page: number | null;
  charStart: number;
  charEnd: number;
};

// ~800 chars (roughly 150-200 tokens) is small enough that a chunk stays
// about one topic — important for citation precision, since we show the
// user the exact chunk an answer came from — but large enough to avoid
// flooding retrieval with hundreds of tiny fragments. ~100 chars (~12%)
// of overlap means a sentence that falls near a split point still appears
// in full in at least one chunk, so we don't lose it at a boundary.
export const DEFAULT_CHUNK_SIZE = 800;
export const DEFAULT_CHUNK_OVERLAP = 100;

type Section = {
  heading: Heading | null;
  start: number;
  end: number;
};

function getSections(doc: ParsedDocument): Section[] {
  const headings = [...doc.headings].sort((a, b) => a.charIndex - b.charIndex);
  const sections: Section[] = [];

  const firstHeadingStart = headings[0]?.charIndex ?? doc.text.length;
  if (firstHeadingStart > 0) {
    sections.push({ heading: null, start: 0, end: firstHeadingStart });
  }

  headings.forEach((heading, i) => {
    const end = headings[i + 1]?.charIndex ?? doc.text.length;
    sections.push({ heading, start: heading.charIndex, end });
  });

  return sections;
}

function trimRange(text: string, start: number, end: number): [number, number] {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart])) {
    trimmedStart++;
  }
  while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1])) {
    trimmedEnd--;
  }
  return [trimmedStart, trimmedEnd];
}

// Splits `text` into pieces no longer than `size`, snapping each cut to the
// nearest preceding whitespace so words aren't broken mid-token. Returns
// offsets relative to the start of `text`.
function splitBySize(
  text: string,
  size: number,
  overlap: number,
): { start: number; end: number }[] {
  if (text.length <= size) {
    return [{ start: 0, end: text.length }];
  }

  const pieces: { start: number; end: number }[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    pieces.push({ start, end });
    if (end >= text.length) break;

    const next = end - overlap;
    start = next > start ? next : end;
  }

  return pieces;
}

function pageForOffset(pages: Page[], offset: number): number | null {
  let page: number | null = null;
  for (const p of pages) {
    if (p.charIndex > offset) break;
    page = p.pageNumber;
  }
  return page;
}

export function chunkDocument(
  doc: ParsedDocument,
  options?: { chunkSize?: number; overlap?: number },
): Chunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const chunks: Chunk[] = [];

  for (const section of getSections(doc)) {
    const [start, end] = trimRange(doc.text, section.start, section.end);
    if (start === end) continue;

    const sectionText = doc.text.slice(start, end);

    for (const piece of splitBySize(sectionText, chunkSize, overlap)) {
      const charStart = start + piece.start;
      const charEnd = start + piece.end;

      chunks.push({
        content: doc.text.slice(charStart, charEnd),
        heading: section.heading?.text ?? null,
        headingLevel: section.heading?.level ?? null,
        page: pageForOffset(doc.pages, charStart),
        charStart,
        charEnd,
      });
    }
  }

  return chunks;
}
