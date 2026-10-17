import "server-only";

import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import { generateTestsForRequirements } from "@/lib/agents/nodes/generate-tests";
import { trackStep } from "@/lib/agents/tracking";
import { db } from "@/lib/db/client";
import { getRunDetail } from "@/lib/db/queries";
import {
  requirements,
  reviewEvents,
  runs,
  testCases,
} from "@/lib/db/schema";
import type { ReviewEventView, RunDetail, TestCaseView } from "@/lib/runs/types";
import {
  toReviewEventView,
  toTestCaseView,
} from "@/lib/runs/views";

import {
  diffTestCase,
  isReviewOpen,
  nextStatus,
  type ResolveRequirementSchema,
  type ReviewRequestSchema,
  ReviewTransitionError,
} from "./transitions";

// Carries the HTTP status the route should answer with, so route handlers
// stay a thin translation layer.
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

const REVIEW_CLOSED =
  "This run isn't open for review. Review happens while a run is waiting for review.";

const ACTION_FOR = {
  approve: "approved",
  reject: "rejected",
  edit: "edited",
} as const;

// Applies one review action and records it in the history, in a single
// transaction: the status change and its audit entry are saved together
// or not at all. The row lock (SELECT ... FOR UPDATE) makes two reviewers
// clicking at once apply one after the other, so each sees the status
// the other left and the history's from/to statuses are always true.
export async function reviewTestCase(
  testCaseId: string,
  { actor, change }: z.infer<typeof ReviewRequestSchema>,
): Promise<{ testCase: TestCaseView; event: ReviewEventView }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ testCase: testCases, runId: requirements.runId, runStatus: runs.status })
      .from(testCases)
      .innerJoin(requirements, eq(testCases.requirementId, requirements.id))
      .innerJoin(runs, eq(requirements.runId, runs.id))
      .where(eq(testCases.id, testCaseId))
      .for("update", { of: testCases });

    if (!current) throw new ReviewError("Test case not found", 404);
    if (!isReviewOpen(current.runStatus)) throw new ReviewError(REVIEW_CLOSED, 409);

    let status;
    try {
      status = nextStatus(current.testCase.status, change.action);
    } catch (error) {
      if (error instanceof ReviewTransitionError) {
        throw new ReviewError(error.message, 409);
      }
      throw error;
    }

    const [updated] = await tx
      .update(testCases)
      .set({
        status,
        updatedAt: new Date(),
        ...(change.action === "edit" ? change.testCase : {}),
      })
      .where(eq(testCases.id, testCaseId))
      .returning();

    const [event] = await tx
      .insert(reviewEvents)
      .values({
        runId: current.runId,
        requirementId: current.testCase.requirementId,
        testCaseId,
        actor,
        action: ACTION_FOR[change.action],
        fromStatus: current.testCase.status,
        toStatus: status,
        changes:
          change.action === "edit"
            ? diffTestCase(current.testCase, change.testCase)
            : null,
      })
      .returning();

    return { testCase: toTestCaseView(updated), event: toReviewEventView(event) };
  });
}

// Resolves an ambiguous requirement with a rewrite (the suggested one or
// the reviewer's own) and regenerates its tests from the new text — for
// this requirement only, reusing the pipeline's own generation logic.
//
// The model call happens before the transaction, not inside it: a
// transaction held open across a multi-second network call would pin a
// DB connection and its locks for that whole time. If the call fails,
// nothing has been changed yet.
export async function resolveRequirement(
  requirementId: string,
  { actor, text }: z.infer<typeof ResolveRequirementSchema>,
): Promise<RunDetail> {
  const [current] = await db
    .select({ requirement: requirements, runStatus: runs.status })
    .from(requirements)
    .innerJoin(runs, eq(requirements.runId, runs.id))
    .where(eq(requirements.id, requirementId));

  if (!current) throw new ReviewError("Requirement not found", 404);
  const { requirement } = current;
  if (!isReviewOpen(current.runStatus)) throw new ReviewError(REVIEW_CLOSED, 409);
  if (!requirement.isAmbiguous || requirement.ambiguityResolved) {
    throw new ReviewError("This requirement isn't waiting for a rewrite.", 409);
  }

  const generated = await trackStep(
    {
      documentId: requirement.documentId,
      runId: requirement.runId,
      // Not part of a streamed graph run, so there's nobody to emit to; the
      // caller gets the updated run back in the response instead.
      emit: () => {},
    },
    "regenerate_tests",
    async () => {
      const { testCases: result, usage } = await generateTestsForRequirements([
        {
          id: requirement.code,
          title: requirement.title,
          text,
          sourceChunkIds: requirement.sourceChunkIds,
          // The reviewer has settled the wording, so these tests no longer
          // rest on an assumption.
          isAmbiguous: false,
          ambiguityReason: null,
          suggestedRewrite: null,
        },
      ]);
      return { result, usage };
    },
  );

  await db.transaction(async (tx) => {
    // Conditional on still being unresolved: if another reviewer resolved
    // it while our tests were generating, theirs stands and ours is dropped.
    const [resolved] = await tx
      .update(requirements)
      .set({ text, originalText: requirement.text, ambiguityResolved: true })
      .where(
        and(
          eq(requirements.id, requirementId),
          eq(requirements.ambiguityResolved, false),
        ),
      )
      .returning({ id: requirements.id });
    if (!resolved) {
      throw new ReviewError("Someone else resolved this requirement first.", 409);
    }
    // Tests written against the old interpretation no longer apply.
    await tx.delete(testCases).where(eq(testCases.requirementId, requirementId));
    if (generated.length > 0) {
      await tx.insert(testCases).values(
        generated.map((tc) => ({
          requirementId,
          title: tc.title,
          type: tc.type,
          given: tc.given,
          when: tc.when,
          then: tc.then,
          basedOnAssumption: false,
        })),
      );
    }
    await tx.insert(reviewEvents).values({
      runId: requirement.runId,
      requirementId,
      actor,
      action: "requirement_rewritten",
      changes: { text: { from: requirement.text, to: text } },
    });
  });

  const detail = await getRunDetail(requirement.runId);
  if (!detail) throw new ReviewError("Run not found", 404);
  return detail;
}
