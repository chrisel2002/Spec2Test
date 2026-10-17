import type {
  agentRuns,
  requirements,
  reviewEvents,
  runs,
  testCases,
} from "@/lib/db/schema";

import {
  type RequirementView,
  type ReviewEventView,
  type RunSummary,
  StepNameSchema,
  type StepView,
  type TestCaseView,
} from "./types";

// DB row -> JSON-safe view. Type-only schema imports, so this stays free of
// the DB client and can be unit tested without DATABASE_URL.

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function toRunSummary(row: typeof runs.$inferSelect): RunSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    error: row.error,
    rateLimited: row.rateLimited,
    coverage: row.coverage ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: iso(row.finishedAt),
  };
}

export function toStepView(row: typeof agentRuns.$inferSelect): StepView {
  return {
    id: row.id,
    step: StepNameSchema.parse(row.step),
    status: row.status,
    error: row.error,
    costUsd: row.costUsd,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

export function toRequirementView(
  row: typeof requirements.$inferSelect,
): RequirementView {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    text: row.text,
    isAmbiguous: row.isAmbiguous,
    ambiguityReason: row.ambiguityReason,
    suggestedRewrite: row.suggestedRewrite,
    ambiguityResolved: row.ambiguityResolved,
    originalText: row.originalText,
  };
}

export function toTestCaseView(
  row: typeof testCases.$inferSelect,
): TestCaseView {
  return {
    id: row.id,
    requirementId: row.requirementId,
    title: row.title,
    type: row.type,
    given: row.given,
    when: row.when,
    then: row.then,
    status: row.status,
    basedOnAssumption: row.basedOnAssumption,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toReviewEventView(
  row: typeof reviewEvents.$inferSelect,
): ReviewEventView {
  return {
    id: row.id,
    requirementId: row.requirementId,
    testCaseId: row.testCaseId,
    actor: row.actor,
    action: row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changes: row.changes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
