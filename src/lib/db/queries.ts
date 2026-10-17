import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client";
import { agentRuns, chunks, documents, requirements, runs, testCases } from "./schema";

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

// Returns the step rows (status, usage, cost) for a document's most recent
// agent run, or [] if it has never had one.
export async function getLatestRunSteps(documentId: string) {
  const runId = await getLatestRunId(documentId);
  if (!runId) return [];

  return db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.documentId, documentId), eq(agentRuns.runId, runId)))
    .orderBy(asc(agentRuns.startedAt));
}

// Counts for the spoken run summary. Two aggregate queries instead of
// loading every row: the summary only needs the numbers.
export async function getRunSummaryCounts(documentId: string) {
  const runId = await getLatestRunId(documentId);
  if (!runId) {
    return { requirementCount: 0, ambiguousCount: 0, testCaseCount: 0 };
  }

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

export async function listRequirementsWithTestCases(documentId: string) {
  const runId = await getLatestRunId(documentId);
  if (!runId) return [];

  const reqRows = await db
    .select()
    .from(requirements)
    .where(eq(requirements.runId, runId))
    .orderBy(asc(requirements.code));

  const reqIds = reqRows.map((r) => r.id);
  const testRows = reqIds.length
    ? await db
        .select()
        .from(testCases)
        .where(inArray(testCases.requirementId, reqIds))
    : [];

  const testsByRequirement = new Map<string, typeof testRows>();
  for (const testCase of testRows) {
    const list = testsByRequirement.get(testCase.requirementId) ?? [];
    list.push(testCase);
    testsByRequirement.set(testCase.requirementId, list);
  }

  return reqRows.map((requirement) => ({
    ...requirement,
    testCases: testsByRequirement.get(requirement.id) ?? [],
  }));
}
