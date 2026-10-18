import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { requireEnv } from "@/lib/env";
import type { RunEvent, StepName } from "@/lib/runs/types";
import { toStepView } from "@/lib/runs/views";

import { estimateCostUsd } from "./cost";
import { publicErrorMessage } from "./errors";
import type { Usage } from "./usage";

export type Emit = (event: RunEvent) => void;

// LangGraph hands every node a `writer` when the graph is run with
// streamMode "custom": whatever a node writes comes out of graph.stream()
// in order, interleaved with the node's own progress. Outside a streamed
// run (unit tests, a plain invoke) there is no writer and events are
// dropped, so nodes never need to know whether anyone is listening.
export function emitterFrom(config: LangGraphRunnableConfig): Emit {
  return (event) => config.writer?.(event);
}

export type StepContext = { documentId: string; runId: string; emit: Emit };

async function startStep(ctx: StepContext, step: StepName) {
  const [row] = await db
    .insert(agentRuns)
    .values({
      documentId: ctx.documentId,
      runId: ctx.runId,
      step,
      status: "running",
      startedAt: new Date(),
    })
    .returning();
  ctx.emit({ type: "step", step: toStepView(row) });
  return row.id;
}

async function succeedStep(ctx: StepContext, rowId: string, usage: Usage) {
  const [row] = await db
    .update(agentRuns)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      tokenUsage: usage,
      costUsd: estimateCostUsd(requireEnv("MODEL_NAME"), usage),
    })
    .where(eq(agentRuns.id, rowId))
    .returning();
  ctx.emit({ type: "step", step: toStepView(row) });
}

async function failStep(ctx: StepContext, rowId: string, error: unknown) {
  console.error(`Step failed in run ${ctx.runId}`, error);
  const [row] = await db
    .update(agentRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: publicErrorMessage(error),
    })
    .where(eq(agentRuns.id, rowId))
    .returning();
  ctx.emit({ type: "step", step: toStepView(row) });
}

// Wraps a node's body with the start/succeed/fail bookkeeping above, so each
// node only has to implement its actual extraction/analysis logic. Every
// transition is both saved to agent_runs and emitted to the live stream.
export async function trackStep<T>(
  ctx: StepContext,
  step: StepName,
  fn: () => Promise<{ result: T; usage: Usage }>,
): Promise<T> {
  const rowId = await startStep(ctx, step);
  try {
    const { result, usage } = await fn();
    await succeedStep(ctx, rowId, usage);
    return result;
  } catch (error) {
    await failStep(ctx, rowId, error);
    throw error;
  }
}
