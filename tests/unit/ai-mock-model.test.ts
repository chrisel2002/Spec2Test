import { beforeAll, describe, expect, it } from "vitest";

import {
  AmbiguityBatchResultSchema,
  ExtractionBatchResultSchema,
  TestGenerationBatchResultSchema,
} from "@/lib/agents/schemas";
import {
  mockStructuredObject,
  parseLabeledChunks,
  parseNumberedList,
} from "@/lib/ai/mock-model";
import {
  buildAmbiguityPrompt,
  CHECK_AMBIGUITY_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/check-ambiguity";
import {
  buildExtractionPrompt,
  EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/extract-requirements";
import {
  buildTestGenerationPrompt,
  GENERATE_TESTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/generate-tests";

beforeAll(() => {
  process.env.MOCK_MODEL_DELAY_MS = "0";
});

describe("prompt parsing", () => {
  it("reads numbered requirements back out of a prompt", () => {
    const prompt = buildAmbiguityPrompt(["First one.", "Second\nspans lines."]);

    expect(parseNumberedList(prompt)).toEqual(["First one.", "Second\nspans lines."]);
  });

  it("reads labelled chunks back out of a prompt", () => {
    const prompt = buildExtractionPrompt([
      { label: "chunk_1", content: "## A\nThe system shall do A." },
      { label: "chunk_2", content: "Intro text." },
    ]);

    expect(parseLabeledChunks(prompt)).toEqual([
      { label: "chunk_1", content: "## A\nThe system shall do A." },
      { label: "chunk_2", content: "Intro text." },
    ]);
  });
});

describe("mockStructuredObject", () => {
  it("extracts one requirement per obligation sentence, titled after its section", async () => {
    const { object } = await mockStructuredObject(
      EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
      buildExtractionPrompt([
        {
          label: "chunk_1",
          content: "### REQ-1.2: Account lockout\n\nThe system shall lock the account. The user shall see a message.",
        },
        { label: "chunk_2", content: "## Overview\n\nThis document describes login." },
      ]),
    );

    const { requirements } = ExtractionBatchResultSchema.parse(object);
    expect(requirements).toEqual([
      { title: "Account lockout", text: "The system shall lock the account.", sourceChunkRefs: ["chunk_1"] },
      {
        title: "Account lockout (part 2)",
        text: "The user shall see a message.",
        sourceChunkRefs: ["chunk_1"],
      },
    ]);
  });

  it("flags vague wording as ambiguous with a reason and a rewrite", async () => {
    const { object } = await mockStructuredObject(
      CHECK_AMBIGUITY_SYSTEM_PROMPT,
      buildAmbiguityPrompt(["Login should be fast.", "Passwords must be 10 characters."]),
    );

    const { results } = AmbiguityBatchResultSchema.parse(object);
    expect(results[0]).toMatchObject({ isAmbiguous: true });
    expect(results[0].suggestedRewrite).toContain("within 2 seconds");
    expect(results[1]).toEqual({ isAmbiguous: false, reason: null, suggestedRewrite: null });
  });

  it("returns schema-valid tests, one entry per requirement", async () => {
    const { object, usage } = await mockStructuredObject(
      GENERATE_TESTS_SYSTEM_PROMPT,
      buildTestGenerationPrompt(["The system shall do A.", "The system shall do B."]),
    );

    const { results } = TestGenerationBatchResultSchema.parse(object);
    expect(results).toHaveLength(2);
    expect(results[0].testCases.map((tc) => tc.type)).toEqual(["positive", "negative"]);
    expect(usage.totalTokens).toBeGreaterThan(0);
  });

  it("refuses prompts it doesn't recognise rather than guessing", async () => {
    await expect(mockStructuredObject("some other system prompt", "x")).rejects.toThrow(
      /no response/,
    );
  });
});
