import { describe, expect, it } from "vitest";

import {
  AmbiguityBatchResultSchema,
  AmbiguityResultSchema,
  ExtractedRequirementSchema,
  ExtractionBatchResultSchema,
  GeneratedTestCaseSchema,
  RequirementSchema,
  TestCaseSchema,
  TestGenerationBatchResultSchema,
} from "@/lib/agents/schemas";

describe("ExtractedRequirementSchema", () => {
  it("accepts a well-formed requirement", () => {
    const result = ExtractedRequirementSchema.safeParse({
      title: "Account lockout",
      text: "The system shall lock the account after 5 failed attempts.",
      sourceChunkRefs: ["chunk_1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a requirement with no source chunk — it can't be grounded", () => {
    const result = ExtractedRequirementSchema.safeParse({
      title: "Account lockout",
      text: "The system shall lock the account after 5 failed attempts.",
      sourceChunkRefs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("ExtractionBatchResultSchema", () => {
  it("accepts an array of extracted requirements", () => {
    const result = ExtractionBatchResultSchema.safeParse({
      requirements: [
        {
          title: "A",
          text: "The system shall do A.",
          sourceChunkRefs: ["chunk_1"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("RequirementSchema", () => {
  it("accepts a REQ-NN code", () => {
    const result = RequirementSchema.safeParse({
      id: "REQ-01",
      title: "Account lockout",
      text: "The system shall lock the account after 5 failed attempts.",
      sourceChunkIds: ["11111111-1111-1111-1111-111111111111"],
      isAmbiguous: false,
      ambiguityReason: null,
      suggestedRewrite: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed code", () => {
    const result = RequirementSchema.safeParse({
      id: "REQUIREMENT-01",
      title: "x",
      text: "x",
      sourceChunkIds: ["11111111-1111-1111-1111-111111111111"],
      isAmbiguous: false,
      ambiguityReason: null,
      suggestedRewrite: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("AmbiguityResultSchema", () => {
  it("accepts a non-ambiguous result with null reason/rewrite", () => {
    const result = AmbiguityResultSchema.safeParse({
      isAmbiguous: false,
      reason: null,
      suggestedRewrite: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an ambiguous result with a reason and rewrite", () => {
    const result = AmbiguityResultSchema.safeParse({
      isAmbiguous: true,
      reason: "'fast' has no measurable threshold",
      suggestedRewrite: "The system shall respond within 200ms.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects isAmbiguous: true with a null reason", () => {
    const result = AmbiguityResultSchema.safeParse({
      isAmbiguous: true,
      reason: null,
      suggestedRewrite: "The system shall respond within 200ms.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects isAmbiguous: true with a null suggestedRewrite", () => {
    const result = AmbiguityResultSchema.safeParse({
      isAmbiguous: true,
      reason: "'fast' has no measurable threshold",
      suggestedRewrite: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("AmbiguityBatchResultSchema", () => {
  it("accepts an array of mixed ambiguous/non-ambiguous results", () => {
    const result = AmbiguityBatchResultSchema.safeParse({
      results: [
        { isAmbiguous: false, reason: null, suggestedRewrite: null },
        {
          isAmbiguous: true,
          reason: "vague",
          suggestedRewrite: "measurable version",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("GeneratedTestCaseSchema / TestGenerationBatchResultSchema", () => {
  it("accepts a well-formed test case", () => {
    const result = GeneratedTestCaseSchema.safeParse({
      title: "Lock after 5 failed attempts",
      type: "negative",
      given: "A user with 4 prior failed attempts",
      when: "They submit a 5th incorrect password",
      then: "The account is locked for 15 minutes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid test case type", () => {
    const result = GeneratedTestCaseSchema.safeParse({
      title: "x",
      type: "edge-case",
      given: "x",
      when: "x",
      then: "x",
    });
    expect(result.success).toBe(false);
  });

  it("enforces 2-4 test cases per requirement in a batch", () => {
    const tooFew = TestGenerationBatchResultSchema.safeParse({
      results: [
        {
          testCases: [
            {
              title: "Only one",
              type: "positive",
              given: "x",
              when: "x",
              then: "x",
            },
          ],
        },
      ],
    });
    expect(tooFew.success).toBe(false);
  });
});

describe("TestCaseSchema", () => {
  it("accepts a test case linked to a requirement", () => {
    const result = TestCaseSchema.safeParse({
      title: "Lock after 5 failed attempts",
      type: "negative",
      given: "A user with 4 prior failed attempts",
      when: "They submit a 5th incorrect password",
      then: "The account is locked for 15 minutes",
      requirementId: "REQ-02",
      basedOnAssumption: false,
    });
    expect(result.success).toBe(true);
  });
});
