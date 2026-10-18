import { z } from "zod";

import { GeneratedTestCaseSchema } from "@/lib/agents/schemas";
import type { RunStatus, TestCaseStatus, TestCaseView } from "@/lib/runs/types";

// Shared by the edit form (client) and the API route (server): the form
// validates with the exact schema the model's output and the PATCH body
// are validated with, so they can't drift apart.
export const EditableTestCaseSchema = GeneratedTestCaseSchema;
export type EditableTestCase = z.infer<typeof EditableTestCaseSchema>;

export const ActorSchema = z
  .string()
  .trim()
  .min(1, "Enter your name so changes can be traced")
  .max(60);

const ReviewChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("edit"), testCase: EditableTestCaseSchema }),
]);
export type ReviewChange = z.infer<typeof ReviewChangeSchema>;

export const ReviewRequestSchema = z.object({
  actor: ActorSchema,
  change: ReviewChangeSchema,
});

// The new wording for an ambiguous requirement: the model's suggested
// rewrite, accepted as-is, or the reviewer's own.
export const ResolveRequirementSchema = z.object({
  actor: ActorSchema,
  text: z.string().trim().min(10, "Write at least a full sentence").max(2000),
});

export class ReviewTransitionError extends Error {}

// The review state machine. Approve and reject move between any two
// different states (a reviewer can change their mind). Saving an edit
// also approves: the reviewer has just written the content themselves,
// and the form's button says "Save and approve" so that's explicit.
export function nextStatus(
  current: TestCaseStatus,
  action: ReviewChange["action"],
): TestCaseStatus {
  switch (action) {
    case "approve":
      if (current === "approved") {
        throw new ReviewTransitionError("This test case is already approved.");
      }
      return "approved";
    case "reject":
      if (current === "rejected") {
        throw new ReviewTransitionError("This test case is already rejected.");
      }
      return "rejected";
    case "edit":
      return "approved";
  }
}

// Review is only open while the run is paused at the checkpoint. Before
// that the agent is still writing tests; after the matrix is built, the
// run is a signed-off record and changes would silently contradict it.
export function isReviewOpen(runStatus: RunStatus): boolean {
  return runStatus === "waiting_for_review";
}

const EDITABLE_FIELDS = ["title", "type", "given", "when", "then"] as const;

// Field-level before/after for the review history, containing only the
// fields that actually changed.
export function diffTestCase(
  before: Pick<TestCaseView, (typeof EDITABLE_FIELDS)[number]>,
  after: EditableTestCase,
): Record<string, { from: string; to: string }> {
  const changes: Record<string, { from: string; to: string }> = {};
  for (const field of EDITABLE_FIELDS) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}
