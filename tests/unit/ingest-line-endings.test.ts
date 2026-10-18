import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { chunkDocument } from "@/lib/ingest/chunk";
import { parseMarkdown } from "@/lib/ingest/markdown";
import { normalizeLineEndings } from "@/lib/ingest/text";

// The sample spec with LF endings whatever the checkout used, then the
// same text saved by Windows (CRLF) and by classic Mac OS (CR).
const lf = normalizeLineEndings(
  readFileSync(join(process.cwd(), "sample-specs/login-account-spec.md"), "utf8"),
);
const crlf = lf.replace(/\n/g, "\r\n");
const cr = lf.replace(/\n/g, "\r");

describe("normalizeLineEndings", () => {
  it("turns CRLF and lone CR into LF and leaves LF alone", () => {
    expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normalizeLineEndings("a\n\nb")).toBe("a\n\nb");
  });

  it("doesn't double a CRLF into two line breaks", () => {
    expect(normalizeLineEndings("a\r\n\r\nb")).toBe("a\n\nb");
  });
});

describe("ingesting a spec with Windows or old Mac line endings", () => {
  const expected = chunkDocument(parseMarkdown(lf));

  it.each([
    ["CRLF", crlf],
    ["CR", cr],
  ])("parses %s to the same text and chunks as LF", (_name, source) => {
    const parsed = parseMarkdown(source);

    expect(parsed.text).toBe(lf);
    expect(parsed.text).not.toMatch(/\r/);
    expect(chunkDocument(parsed)).toEqual(expected);
  });

  it("keeps chunk offsets aligned with the stored text for a CRLF upload", () => {
    const parsed = parseMarkdown(crlf);

    for (const chunk of chunkDocument(parsed)) {
      expect(parsed.text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content);
    }
  });
});
