import { z } from "zod";

// ---------------------------------------------------------------------------
// Test case type
// ---------------------------------------------------------------------------

export const TestCaseTypeSchema = z.enum(["positive", "negative", "boundary"]);
export type TestCaseType = z.infer<typeof TestCaseTypeSchema>;

// ---------------------------------------------------------------------------
// Node 1 — extract requirements
// ---------------------------------------------------------------------------

// What the model returns for one batch of chunks. `sourceChunkRefs` cites the
// short labels we assign chunks in the prompt (e.g. "chunk_2"), not real
// chunk UUIDs — the model never sees or invents real IDs. `.min(1)` means a
// requirement that can't be tied back to a source chunk is a schema
// violation, not just a prompt suggestion: the model structurally cannot
// emit an ungrounded requirement.
export const ExtractedRequirementSchema = z.object({
  title: z.string().describe("A short, specific title for this requirement"),
  text: z
    .string()
    .describe(
      "The full requirement, rewritten as a single atomic, testable statement",
    ),
  sourceChunkRefs: z
    .array(z.string())
    .min(1)
    .describe("Which given chunk label(s) (e.g. 'chunk_2') this came from"),
});
export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;

export const ExtractionBatchResultSchema = z.object({
  requirements: z.array(ExtractedRequirementSchema),
});

// A requirement after our code has assigned its REQ-NN code and resolved
// sourceChunkRefs to real chunk UUIDs — the shape carried in graph state
// from node 1 onward, and what we store in the requirements table.
export const RequirementSchema = z.object({
  id: z.string().regex(/^REQ-\d+$/),
  title: z.string(),
  text: z.string(),
  sourceChunkIds: z.array(z.string()).min(1),
  isAmbiguous: z.boolean(),
  ambiguityReason: z.string().nullable(),
  suggestedRewrite: z.string().nullable(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

// ---------------------------------------------------------------------------
// Node 2 — check ambiguity
// ---------------------------------------------------------------------------

export const AmbiguityResultSchema = z
  .object({
    isAmbiguous: z.boolean(),
    reason: z
      .string()
      .nullable()
      .describe("Why it's ambiguous, e.g. vague wording or a missing threshold"),
    suggestedRewrite: z
      .string()
      .nullable()
      .describe("A measurable rewrite of the requirement, or null if not ambiguous"),
  })
  .refine(
    (val) =>
      !val.isAmbiguous || (val.reason !== null && val.suggestedRewrite !== null),
    {
      message:
        "reason and suggestedRewrite are required when isAmbiguous is true",
    },
  );
export type AmbiguityResult = z.infer<typeof AmbiguityResultSchema>;

export const AmbiguityBatchResultSchema = z.object({
  results: z.array(AmbiguityResultSchema),
});

// ---------------------------------------------------------------------------
// Node 3 — generate tests
// ---------------------------------------------------------------------------

export const GeneratedTestCaseSchema = z.object({
  title: z.string(),
  type: TestCaseTypeSchema,
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
export type GeneratedTestCase = z.infer<typeof GeneratedTestCaseSchema>;

// One entry per requirement in the batch, in the same order — matches each
// requirement to between 2 and 4 test cases without needing the model to
// echo back which requirement each one belongs to.
export const TestGenerationBatchResultSchema = z.object({
  results: z.array(
    z.object({
      testCases: z.array(GeneratedTestCaseSchema).min(2).max(4),
    }),
  ),
});

// A test case after linking it to its requirement and flagging whether it
// was generated from an ambiguous requirement's suggested rewrite.
export const TestCaseSchema = z.object({
  title: z.string(),
  type: TestCaseTypeSchema,
  given: z.string(),
  when: z.string(),
  then: z.string(),
  requirementId: z.string().regex(/^REQ-\d+$/),
  basedOnAssumption: z.boolean(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;
