import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { requireEnv } from "@/lib/env";

import { estimateCostUsd } from "./cost";
import type { Usage } from "./usage";

export type StepName =
  | "extract_requirements"
  | "check_ambiguity"
  | "generate_tests";

export async function startStep(
  documentId: string,
  runId: string,
  step: StepName,
): Promise<string> {
  const [row] = await db
    .insert(agentRuns)
    .values({ documentId, runId, step, status: "running", startedAt: new Date() })
    .returning({ id: agentRuns.id });
  return row.id;
}

export async function succeedStep(rowId: string, usage: Usage): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      tokenUsage: usage,
      costUsd: estimateCostUsd(requireEnv("MODEL_NAME"), usage),
    })
    .where(eq(agentRuns.id, rowId));
}

export async function failStep(rowId: string, error: unknown): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
    })
    .where(eq(agentRuns.id, rowId));
}

// Wraps a node's body with the start/succeed/fail bookkeeping above, so each
// node only has to implement its actual extraction/analysis logic.
export async function trackStep<T>(
  documentId: string,
  runId: string,
  step: StepName,
  fn: () => Promise<{ result: T; usage: Usage }>,
): Promise<T> {
  const rowId = await startStep(documentId, runId, step);
  try {
    const { result, usage } = await fn();
    await succeedStep(rowId, usage);
    return result;
  } catch (error) {
    await failStep(rowId, error);
    throw error;
  }
}
