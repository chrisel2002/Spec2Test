import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { parsePdf } from "@/lib/ingest/pdf";
import type { ParsedDocument } from "@/lib/ingest/types";

// pdf.js's Node worker shim detaches the input buffer's underlying memory
// after use, so a second parsePdf() call against the same buffer throws
// DataCloneError. Parsing once here and sharing the result across
// assertions avoids that and is also just less redundant work.
let parsed: ParsedDocument;

beforeAll(async () => {
  const data = new Uint8Array(
    readFileSync(join(process.cwd(), "sample-specs/login-account-spec.pdf")),
  );
  parsed = await parsePdf(data);
});

describe("parsePdf", () => {
  it("extracts all pages", () => {
    expect(parsed.pages).toHaveLength(3);
    expect(parsed.pages[0]).toMatchObject({ pageNumber: 1, charIndex: 0 });
    expect(parsed.pages[1].pageNumber).toBe(2);
  });

  it("detects title, section, and requirement headings, matching Markdown's nesting", () => {
    const title = parsed.headings.find((h) =>
      h.text.includes("Login and Account"),
    );
    const section = parsed.headings.find(
      (h) => h.text === "1. Authentication",
    );
    const requirement = parsed.headings.find((h) =>
      h.text.startsWith("REQ-LA-02:"),
    );

    expect(title?.level).toBe(1);
    expect(section?.level).toBe(2);
    expect(requirement?.level).toBe(3);
  });

  it("does not misclassify ordinary body text as a heading", () => {
    const falsePositive = parsed.headings.find((h) =>
      h.text.includes("registered user to log in"),
    );

    expect(falsePositive).toBeUndefined();
  });

  it("assigns the correct page number to a heading on a later page", () => {
    const security = parsed.headings.find(
      (h) => h.text === "4. Account Security",
    );

    expect(security?.page).toBe(3);
  });

  it("includes requirement body text for retrieval", () => {
    // PDF text wraps wherever the page layout did, so compare with line
    // breaks collapsed to spaces.
    expect(parsed.text.replace(/\s+/g, " ")).toContain(
      "lock a user's account for 15 minutes after 5 consecutive failed login attempts",
    );
  });
});
