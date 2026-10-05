import type { ParsedDocument } from "./types";

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;

export function parseMarkdown(source: string): ParsedDocument {
  const text = source.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headings: ParsedDocument["headings"] = [];

  let charIndex = 0;
  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        charIndex,
      });
    }
    charIndex += line.length + 1; // +1 for the newline stripped by split()
  }

  return { text, headings, pages: [] };
}
