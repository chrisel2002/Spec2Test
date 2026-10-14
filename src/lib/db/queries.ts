import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client";
import { agentRuns, chunks, documents, requirements, testCases } from "./schema";

export async function listDocumentSummaries() {
  return db
    .select({
      id: documents.id,
      filename: documents.filename,
      chunkCount: sql<number>`count(${chunks.id})`.mapWith(Number),
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

// Returns the step rows (status, usage, cost) for a document's most recent
// agent run, or [] if it has never had one.
export async function getLatestRunSteps(documentId: string) {
  const [latest] = await db
    .select({ runId: agentRuns.runId })
    .from(agentRuns)
    .where(eq(agentRuns.documentId, documentId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);

  if (!latest) return [];

  return db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.documentId, documentId),
        eq(agentRuns.runId, latest.runId),
      ),
    )
    .orderBy(asc(agentRuns.startedAt));
}

// Counts for the spoken run summary. Two aggregate queries instead of
// loading every row: the summary only needs the numbers.
export async function getRunSummaryCounts(documentId: string) {
  const [reqCounts] = await db
    .select({
      requirementCount: sql<number>`count(*)`.mapWith(Number),
      ambiguousCount:
        sql<number>`count(*) filter (where ${requirements.isAmbiguous})`.mapWith(
          Number,
        ),
    })
    .from(requirements)
    .where(eq(requirements.documentId, documentId));

  const [testCounts] = await db
    .select({ testCaseCount: sql<number>`count(*)`.mapWith(Number) })
    .from(testCases)
    .innerJoin(requirements, eq(testCases.requirementId, requirements.id))
    .where(eq(requirements.documentId, documentId));

  return {
    requirementCount: reqCounts?.requirementCount ?? 0,
    ambiguousCount: reqCounts?.ambiguousCount ?? 0,
    testCaseCount: testCounts?.testCaseCount ?? 0,
  };
}

export async function listRequirementsWithTestCases(documentId: string) {
  const reqRows = await db
    .select()
    .from(requirements)
    .where(eq(requirements.documentId, documentId))
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
