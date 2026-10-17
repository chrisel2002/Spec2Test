import { describe, expect, it } from "vitest";

import {
  diffTestCase,
  isReviewOpen,
  nextStatus,
  ResolveRequirementSchema,
  ReviewRequestSchema,
  ReviewTransitionError,
} from "@/lib/review/transitions";

const baseTestCase = {
  title: "Locks the account",
  type: "positive" as const,
  given: "a user with 4 failed attempts",
  when: "they fail a 5th time",
  then: "the account is locked for 15 minutes",
};

describe("nextStatus", () => {
  it("approves a draft", () => {
    expect(nextStatus("draft", "approve")).toBe("approved");
  });

  it("rejects a draft", () => {
    expect(nextStatus("draft", "reject")).toBe("rejected");
  });

  it("lets a reviewer change their mind in either direction", () => {
    expect(nextStatus("approved", "reject")).toBe("rejected");
    expect(nextStatus("rejected", "approve")).toBe("approved");
  });

  it("refuses to approve an already approved test", () => {
    expect(() => nextStatus("approved", "approve")).toThrow(ReviewTransitionError);
  });

  it("refuses to reject an already rejected test", () => {
    expect(() => nextStatus("rejected", "reject")).toThrow(ReviewTransitionError);
  });

  it("approves on edit, from any status", () => {
    expect(nextStatus("draft", "edit")).toBe("approved");
    expect(nextStatus("approved", "edit")).toBe("approved");
    expect(nextStatus("rejected", "edit")).toBe("approved");
  });
});

describe("isReviewOpen", () => {
  it("is open only while the run waits for review", () => {
    expect(isReviewOpen("waiting_for_review")).toBe(true);
    expect(isReviewOpen("running")).toBe(false);
    expect(isReviewOpen("completed")).toBe(false);
    expect(isReviewOpen("failed")).toBe(false);
  });
});

describe("diffTestCase", () => {
  it("records only the fields that changed, with before and after", () => {
    const changes = diffTestCase(baseTestCase, {
      ...baseTestCase,
      then: "the account is locked for 30 minutes",
      type: "boundary",
    });

    expect(changes).toEqual({
      type: { from: "positive", to: "boundary" },
      then: {
        from: "the account is locked for 15 minutes",
        to: "the account is locked for 30 minutes",
      },
    });
  });

  it("returns no changes for an identical edit", () => {
    expect(diffTestCase(baseTestCase, { ...baseTestCase })).toEqual({});
  });
});

describe("ReviewRequestSchema", () => {
  it("accepts an approve with an actor", () => {
    const parsed = ReviewRequestSchema.safeParse({
      actor: "Dana",
      change: { action: "approve" },
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a non-blank actor so every change can be traced", () => {
    const parsed = ReviewRequestSchema.safeParse({
      actor: "   ",
      change: { action: "approve" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an edit with an empty Given/When/Then field", () => {
    const parsed = ReviewRequestSchema.safeParse({
      actor: "Dana",
      change: { action: "edit", testCase: { ...baseTestCase, when: "" } },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Describe the action");
  });

  it("rejects an unknown action", () => {
    const parsed = ReviewRequestSchema.safeParse({
      actor: "Dana",
      change: { action: "delete" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ResolveRequirementSchema", () => {
  it("trims the rewrite and rejects one that's too short to be a requirement", () => {
    expect(
      ResolveRequirementSchema.safeParse({ actor: "Dana", text: "  too short " }).success,
    ).toBe(false);

    const parsed = ResolveRequirementSchema.parse({
      actor: "Dana",
      text: "  The page shall load within 2 seconds.  ",
    });
    expect(parsed.text).toBe("The page shall load within 2 seconds.");
  });
});
