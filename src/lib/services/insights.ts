import "server-only";

import { and, desc, eq, exists, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentRuns, documents, reviewEvents, runs, testCases } from "@/lib/db/schema";
import {
  averageStepDurations,
  costPerRun,
  type ReviewRow,
  type StepRow,
  summariseReviews,
} from "@/lib/insights/aggregate";
import { StepNameSchema } from "@/lib/runs/types";

// How many recent runs the cost chart shows.
const RECENT_RUNS = 30;

export async function getInsights() {
  const recentRuns = await db
    .select({ id: runs.id })
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(RECENT_RUNS);
  const runIds = recentRuns.map((r) => r.id);

  const stepRows: StepRow[] = runIds.length
    ? (
        await db
          .select({
            runId: agentRuns.runId,
            runCreatedAt: runs.createdAt,
            filename: documents.filename,
            step: agentRuns.step,
            status: agentRuns.status,
            costUsd: agentRuns.costUsd,
            tokenUsage: agentRuns.tokenUsage,
            startedAt: agentRuns.startedAt,
            finishedAt: agentRuns.finishedAt,
          })
          .from(agentRuns)
          .innerJoin(runs, eq(agentRuns.runId, runs.id))
          .innerJoin(documents, eq(runs.documentId, documents.id))
          .where(inArray(agentRuns.runId, runIds))
      ).flatMap((row) => {
        const step = StepNameSchema.safeParse(row.step);
        if (!step.success) return [];
        return [{ ...row, step: step.data, totalTokens: row.tokenUsage?.totalTokens ?? null }];
      })
    : [];

  // Every generated test with its review outcome: its status, and whether
  // a reviewer edited it (an "edited" event exists for it).
  const reviewRows: ReviewRow[] = await db
    .select({
      status: testCases.status,
      edited: exists(
        db
          .select({ id: reviewEvents.id })
          .from(reviewEvents)
          .where(and(eq(reviewEvents.testCaseId, testCases.id), eq(reviewEvents.action, "edited"))),
      ).mapWith(Boolean),
    })
    .from(testCases);

  return {
    costs: costPerRun(stepRows),
    durations: averageStepDurations(stepRows),
    reviews: summariseReviews(reviewRows),
  };
}
