import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMarkdown } from "@/lib/ingest/markdown";

const source = readFileSync(
  join(process.cwd(), "sample-specs/login-and-account.md"),
  "utf8",
);

describe("parseMarkdown", () => {
  it("returns no pages, since Markdown has no page concept", () => {
    expect(parseMarkdown(source).pages).toEqual([]);
  });

  it("extracts headings at every level with correct nesting", () => {
    const { headings } = parseMarkdown(source);

    expect(headings[0]).toMatchObject({
      level: 1,
      text: "Login and Account Management — Requirements Specification",
    });
    expect(headings.filter((h) => h.level === 2)).toHaveLength(5);
    expect(headings.filter((h) => h.level === 3)).toHaveLength(13);
  });

  it("points charIndex at the heading's line in the text", () => {
    const { text, headings } = parseMarkdown(source);
    const lockout = headings.find((h) =>
      h.text.includes("Account lockout after failed login attempts"),
    );

    expect(lockout).toBeDefined();
    expect(
      text.slice(lockout!.charIndex, lockout!.charIndex + 20),
    ).toBe("### REQ-1.2: Account");
  });

  it("normalizes CRLF line endings to LF", () => {
    const { text } = parseMarkdown("# Title\r\n\r\nBody text.\r\n");
    expect(text).not.toContain("\r");
  });
});
