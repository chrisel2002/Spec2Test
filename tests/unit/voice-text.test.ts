import { describe, expect, it } from "vitest";

import { buildRunSummary, stripCitations } from "@/lib/voice/text";

describe("stripCitations", () => {
  it("removes single and adjacent citation markers", () => {
    expect(stripCitations("Users must log in [1]. Sessions expire [2][3].")).toBe(
      "Users must log in. Sessions expire.",
    );
  });

  it("removes comma-separated markers", () => {
    expect(stripCitations("Passwords are hashed [1, 2], always.")).toBe(
      "Passwords are hashed, always.",
    );
  });

  it("leaves non-numeric brackets alone", () => {
    expect(stripCitations("Press [Enter] to submit.")).toBe(
      "Press [Enter] to submit.",
    );
  });

  it("keeps line breaks between paragraphs", () => {
    expect(stripCitations("First [1].\n\nSecond [2].")).toBe(
      "First.\n\nSecond.",
    );
  });
});

describe("buildRunSummary", () => {
  it("builds the spoken summary from counts", () => {
    expect(
      buildRunSummary({
        requirementCount: 12,
        ambiguousCount: 3,
        testCaseCount: 31,
      }),
    ).toBe("12 requirements found. 3 are ambiguous. 31 test cases generated.");
  });

  it("uses singular forms for a count of one", () => {
    expect(
      buildRunSummary({
        requirementCount: 1,
        ambiguousCount: 1,
        testCaseCount: 1,
      }),
    ).toBe("1 requirement found. 1 is ambiguous. 1 test case generated.");
  });

  it("says so when nothing has been extracted yet", () => {
    expect(
      buildRunSummary({
        requirementCount: 0,
        ambiguousCount: 0,
        testCaseCount: 0,
      }),
    ).toMatch(/No requirements/);
  });
});
