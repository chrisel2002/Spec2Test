import { z } from "zod";

// The expected results ("golden" answers) for one sample spec, which the
// eval harness scores the agent against. Plain JSON, so a person can read
// and correct it without touching code; this schema catches mistakes in
// it (typos in ids, broken regexes, missing reasons) before an eval runs.

// One group of alternative words or phrases. A group is satisfied when the
// text mentions any of them, matched case-insensitively at the start of a
// word: "lock" matches "lock", "locked", and "lockout", but not "unlock";
// "valid" matches "validate" but not "invalid".
const TermGroupSchema = z.array(z.string().min(1)).min(1);

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

const GoldenRequirementSchema = z
  .object({
    // The id the evaluation reports. Equal to sourceId, except for the
    // parts of a compound requirement that should be split: REQ-LA-11.1
    // and REQ-LA-11.2 both come from REQ-LA-11.
    id: z.string().regex(/^REQ-(LA|CO|IN)-\d{2}(\.\d)?$/),
    sourceId: z.string().regex(/^REQ-(LA|CO|IN)-\d{2}$/),
    // The atomic requirement a good extraction should produce, for people
    // reading this file; matching uses matchTerms, not this text.
    statement: z.string().min(10),
    ambiguous: z.boolean(),
    // Why it can't be tested as written (ambiguous requirements only).
    ambiguityReason: z.string().min(1).optional(),
    // An extracted requirement matches this one when it satisfies every
    // group: each group is one essential idea, and the alternatives inside
    // it are ways the model might phrase that idea.
    matchTerms: z.array(TermGroupSchema).min(1),
    note: z.string().optional(),
  })
  .refine((r) => r.ambiguous === Boolean(r.ambiguityReason), {
    message: "ambiguityReason is required for ambiguous requirements, and only for them",
  })
  .refine((r) => r.id === r.sourceId || r.id.startsWith(`${r.sourceId}.`), {
    message: "id must equal sourceId, or be sourceId plus a part number for a split",
  });

const GoldenBoundarySchema = z.object({
  id: z.string().regex(/^(LA|CO|IN)-B\d+$/),
  requirementId: z.string(),
  // The value in plain words, as reported in eval results.
  value: z.string().min(1),
  // Why a good test should exercise it.
  why: z.string().min(1),
  // Case-insensitive regexes, tested against each generated test's title
  // and Given/When/Then. The boundary counts as covered when any pattern
  // matches any one test of the run.
  patterns: z.array(z.string().refine(isValidRegex, "Invalid regex")).min(1),
  // Test-like sentences the patterns must match, and must not match. The
  // golden-file unit test checks both, so a pattern can't silently drift
  // into matching everything or nothing.
  examples: z.array(z.string()).min(1),
  counterExamples: z.array(z.string()).default([]),
});

export const GoldenSpecSchema = z
  .object({
    spec: z.string().regex(/^[\w-]+\.md$/),
    // Where the spec lives, relative to the repo root.
    specDir: z.string().default("sample-specs"),
    description: z.string(),
    requirements: z.array(GoldenRequirementSchema).min(1),
    boundaries: z.array(GoldenBoundarySchema),
    // Regexes that must not match anything the agent produced (requirement
    // or test text). Used by adversarial specs, e.g. to check an injected
    // instruction wasn't obeyed.
    forbiddenOutput: z.array(z.string().refine(isValidRegex, "Invalid regex")).default([]),
  })
  .superRefine((golden, ctx) => {
    const ids = golden.requirements.map((r) => r.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({ code: "custom", message: `Duplicate requirement ids: ${duplicates.join(", ")}` });
    }
    for (const boundary of golden.boundaries) {
      if (!ids.includes(boundary.requirementId)) {
        ctx.addIssue({
          code: "custom",
          message: `Boundary ${boundary.id} points at unknown requirement ${boundary.requirementId}`,
        });
      }
    }
  });

export type GoldenSpec = z.infer<typeof GoldenSpecSchema>;
