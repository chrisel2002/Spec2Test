import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { chunkDocument } from "@/lib/ingest/chunk";
import { parseMarkdown } from "@/lib/ingest/markdown";
import { parsePdf } from "@/lib/ingest/pdf";
import type { ParsedDocument } from "@/lib/ingest/types";

describe("chunkDocument on the login Markdown spec", () => {
  const source = readFileSync(
    join(process.cwd(), "sample-specs/login-account-spec.md"),
    "utf8",
  );
  const parsed = parseMarkdown(source);
  const chunks = chunkDocument(parsed);

  it("produces one chunk per heading, since every section is short", () => {
    // 1 title + 5 section headings + 17 requirement headings
    expect(chunks).toHaveLength(23);
  });

  it("attaches the nearest heading, its level, and no page (Markdown has none)", () => {
    const lockout = chunks.find((c) =>
      c.heading?.includes("Account lockout after failed login attempts"),
    );

    expect(lockout).toBeDefined();
    expect(lockout?.headingLevel).toBe(3);
    expect(lockout?.page).toBeNull();
    expect(lockout?.content).toMatch(
      /15 minutes after 5 consecutive\s+failed\s+login attempts/,
    );
  });

  // Offsets index into the parsed (line-ending-normalized) text, which is
  // what gets stored as raw_text, not into the file's raw bytes.
  it("keeps charStart/charEnd aligned with the stored text", () => {
    for (const chunk of chunks) {
      expect(parsed.text.slice(chunk.charStart, chunk.charEnd)).toBe(
        chunk.content,
      );
    }
  });
});

describe("chunkDocument on the login PDF spec", () => {
  let chunks: ReturnType<typeof chunkDocument>;

  beforeAll(async () => {
    const data = new Uint8Array(
      readFileSync(join(process.cwd(), "sample-specs/login-account-spec.pdf")),
    );
    chunks = chunkDocument(await parsePdf(data));
  });

  it("attaches the PDF page number to each chunk", () => {
    const lockout = chunks.find((c) =>
      c.heading?.startsWith("REQ-LA-02:"),
    );
    const security = chunks.find((c) => c.heading === "4. Account Security");

    expect(lockout?.page).toBe(1);
    expect(security?.page).toBe(3);
  });
});

describe("chunkDocument size + overlap splitting", () => {
  // A single section longer than chunkSize, built from predictable
  // space-separated tokens so chunk boundaries are easy to reason about.
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
  const body = words.join(" "); // 419 chars
  const text = `# Title\n\n${body}`;
  const doc: ParsedDocument = {
    text,
    headings: [{ level: 1, text: "Title", charIndex: 0 }],
    pages: [],
  };

  const chunks = chunkDocument(doc, { chunkSize: 100, overlap: 20 });

  it("splits a long section into multiple chunks", () => {
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("never produces a chunk longer than chunkSize", () => {
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(100);
    }
  });

  it("cuts on whitespace, never mid-word", () => {
    for (const chunk of chunks) {
      const before = text[chunk.charStart - 1];
      const after = text[chunk.charEnd];
      if (before !== undefined) expect(before).toMatch(/\s/);
      if (after !== undefined) expect(after).toMatch(/\s/);
    }
  });

  it("overlaps consecutive chunks so a boundary word isn't lost", () => {
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].charStart).toBeLessThan(chunks[i - 1].charEnd);
    }
  });

  it("every chunk still carries the section's heading", () => {
    expect(chunks.every((c) => c.heading === "Title")).toBe(true);
  });
});
