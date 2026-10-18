import { z } from "zod";

import { TestCaseTypeSchema } from "@/lib/agents/schemas";

// Shapes shared by the server (which produces them) and the browser (which
// renders them). No server imports here, so client components can import
// this file directly. Dates are ISO strings because everything here
// travels as JSON, over fetch or the event stream.

export const StepNameSchema = z.enum([
  "extract_requirements",
  "check_ambiguity",
  "generate_tests",
  "build_matrix",
  // Re-generating one requirement's tests during review, after a rewrite.
  "regenerate_tests",
]);
export type StepName = z.infer<typeof StepNameSchema>;

const StepStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
]);

const RunStatusSchema = z.enum([
  "running",
  "waiting_for_review",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

const TestCaseStatusSchema = z.enum(["draft", "approved", "rejected"]);
export type TestCaseStatus = z.infer<typeof TestCaseStatusSchema>;

const RunSummarySchema = z.object({
  id: z.string(),
  documentId: z.string(),
  status: RunStatusSchema,
  error: z.string().nullable(),
  rateLimited: z.boolean(),
  coverage: z.object({ covered: z.number(), total: z.number() }).nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

// One agent_runs row. A retried step gets a new row, so a run can have
// several rows for the same step name; the latest one is the step's state.
const StepViewSchema = z.object({
  id: z.string(),
  step: StepNameSchema,
  status: StepStatusSchema,
  error: z.string().nullable(),
  costUsd: z.number().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type StepView = z.infer<typeof StepViewSchema>;

const RequirementViewSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  text: z.string(),
  isAmbiguous: z.boolean(),
  ambiguityReason: z.string().nullable(),
  suggestedRewrite: z.string().nullable(),
  ambiguityResolved: z.boolean(),
  originalText: z.string().nullable(),
});
export type RequirementView = z.infer<typeof RequirementViewSchema>;

export const TestCaseViewSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  title: z.string(),
  type: TestCaseTypeSchema,
  given: z.string(),
  when: z.string(),
  then: z.string(),
  status: TestCaseStatusSchema,
  basedOnAssumption: z.boolean(),
  updatedAt: z.string(),
});
export type TestCaseView = z.infer<typeof TestCaseViewSchema>;

export const ReviewEventViewSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  testCaseId: z.string().nullable(),
  actor: z.string(),
  action: z.enum(["approved", "rejected", "edited", "requirement_rewritten"]),
  fromStatus: TestCaseStatusSchema.nullable(),
  toStatus: TestCaseStatusSchema.nullable(),
  changes: z.record(z.string(), z.object({ from: z.string(), to: z.string() })).nullable(),
  createdAt: z.string(),
});
export type ReviewEventView = z.infer<typeof ReviewEventViewSchema>;

// Everything the UI needs to render one run. Requirements and test cases
// are kept flat (test cases point at their requirement) so stream events
// can upsert either by id without walking a nested tree.
export const RunDetailSchema = z.object({
  run: RunSummarySchema,
  steps: z.array(StepViewSchema),
  requirements: z.array(RequirementViewSchema),
  testCases: z.array(TestCaseViewSchema),
  // Human review history, oldest first.
  reviewEvents: z.array(ReviewEventViewSchema),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

// What the server pushes over the event stream. Every event carries full
// rows rather than diffs, so applying the same event twice is harmless —
// which matters because a reconnecting client can see an event both in
// its fresh snapshot and live.
export const RunEventSchema = z.discriminatedUnion("type", [
  // Sent first on every connection: the run's full state from the DB.
  z.object({ type: z.literal("snapshot"), detail: RunDetailSchema }),
  // The run's own status changed (paused for review, completed, failed).
  z.object({ type: z.literal("run"), run: RunSummarySchema }),
  // A node started, finished, or failed.
  z.object({ type: z.literal("step"), step: StepViewSchema }),
  // Progress within a node, e.g. "Generating tests 5/12".
  z.object({
    type: z.literal("progress"),
    step: StepNameSchema,
    done: z.number().int(),
    total: z.number().int(),
  }),
  z.object({
    type: z.literal("requirements"),
    requirements: z.array(RequirementViewSchema),
  }),
  z.object({
    type: z.literal("testCases"),
    testCases: z.array(TestCaseViewSchema),
  }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
