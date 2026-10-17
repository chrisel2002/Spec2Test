import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client";
import type { RunDetail, RunSummary } from "@/lib/runs/types";
import {
  toRequirementView,
  toReviewEventView,
  toRunSummary,
  toStepView,
  toTestCaseView,
} from "@/lib/runs/views";

import {
  agentRuns,
  chunks,
  documents,
  requirements,
  reviewEvents,
  runs,
  testCases,
} from "./schema";

export async function listDocumentSummaries() {
  return db
    .select({
      id: documents.id,
      filename: documents.filename,
      status: documents.status,
      statusMessage: documents.statusMessage,
      chunkCount: sql<number>`count(${chunks.id})`.mapWith(Number),
      // count(column) skips nulls, so this only counts embedded chunks.
      embeddedCount: sql<number>`count(${chunks.embedding})`.mapWith(Number),
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));
}

export async function listChunksForDocument(documentId: string) {
  return db
    .select({
      id: chunks.id,
      content: chunks.content,
      heading: chunks.heading,
      page: chunks.page,
    })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(asc(chunks.chunkIndex));
}

export async function getLatestRunId(documentId: string): Promise<string | null> {
  const [latest] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.documentId, documentId))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return latest?.id ?? null;
}

// Counts for the spoken run summary. Two aggregate queries instead of
// loading every row: the summary only needs the numbers.
export async function getRunSummaryCounts(runId: string) {
  const [reqCounts] = await db
    .select({
      requirementCount: sql<number>`count(*)`.mapWith(Number),
      ambiguousCount:
        sql<number>`count(*) filter (where ${requirements.isAmbiguous})`.mapWith(
          Number,
        ),
    })
    .from(requirements)
    .where(eq(requirements.runId, runId));

  const [testCounts] = await db
    .select({ testCaseCount: sql<number>`count(*)`.mapWith(Number) })
    .from(testCases)
    .innerJoin(requirements, eq(testCases.requirementId, requirements.id))
    .where(eq(requirements.runId, runId));

  return {
    requirementCount: reqCounts?.requirementCount ?? 0,
    ambiguousCount: reqCounts?.ambiguousCount ?? 0,
    testCaseCount: testCounts?.testCaseCount ?? 0,
  };
}

export async function listRunsForDocument(
  documentId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.documentId, documentId))
    .orderBy(desc(runs.createdAt));
  return rows.map(toRunSummary);
}

// Everything the UI needs to render one run, or null if it doesn't exist.
export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return null;

  const [stepRows, requirementRows, eventRows] = await Promise.all([
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.runId, runId))
      .orderBy(asc(agentRuns.startedAt)),
    db
      .select()
      .from(requirements)
      .where(eq(requirements.runId, runId))
      .orderBy(asc(requirements.code)),
    db
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.runId, runId))
      .orderBy(asc(reviewEvents.createdAt)),
  ]);

  const testRows = requirementRows.length
    ? await db
        .select()
        .from(testCases)
        .where(
          inArray(
            testCases.requirementId,
            requirementRows.map((r) => r.id),
          ),
        )
        // A batch shares one createdAt; type (enum order: positive,
        // negative, boundary) then title keeps the order stable on reload.
        .orderBy(asc(testCases.createdAt), asc(testCases.type), asc(testCases.title))
    : [];

  return {
    run: toRunSummary(run),
    steps: stepRows.map(toStepView),
    requirements: requirementRows.map(toRequirementView),
    testCases: testRows.map(toTestCaseView),
    reviewEvents: eventRows.map(toReviewEventView),
  };
}
