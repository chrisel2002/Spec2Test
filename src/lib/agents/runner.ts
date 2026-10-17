import "server-only";

import { Command } from "@langchain/langgraph";
import { and, eq, inArray } from "drizzle-orm";

import { isRateLimitError } from "@/lib/ai/quota-retry";
import { db } from "@/lib/db/client";
import { getRunDetail } from "@/lib/db/queries";
import { agentRuns, runs } from "@/lib/db/schema";
import { runEventBus } from "@/lib/runs/event-bus";
import {
  type RunDetail,
  RunEventSchema,
  type RunSummary,
} from "@/lib/runs/types";
import { toRunSummary } from "@/lib/runs/views";

import { getAgentGraph } from "./graph";
import type { ReviewResume } from "./nodes/human-review-node";

type RunPatch = Partial<
  Pick<typeof runs.$inferInsert, "status" | "error" | "rateLimited" | "finishedAt">
>;

// Saves a run-level status change and pushes it to anyone watching.
export async function updateRun(
  runId: string,
  patch: RunPatch,
): Promise<RunSummary> {
  const [row] = await db
    .update(runs)
    .set(patch)
    .where(eq(runs.id, runId))
    .returning();
  const run = toRunSummary(row);
  runEventBus.publish(runId, { type: "run", run });
  return run;
}

export async function createRun(documentId: string): Promise<RunSummary> {
  const [row] = await db.insert(runs).values({ documentId }).returning();
  return toRunSummary(row);
}

// How to (re)enter the graph for a run:
// - start:  fresh input; the graph runs from START.
// - resume: answer the human-review interrupt; the graph continues inside
//           the humanReview node, where interrupt() now returns this value.
// - retry:  no input; the graph continues from its last checkpoint, which
//           re-runs the node that failed (nodes are idempotent for this).
export type RunInput =
  | { kind: "start"; documentId: string }
  | { kind: "resume"; resume: ReviewResume }
  | { kind: "retry" };

type GraphInput = Parameters<
  Awaited<ReturnType<typeof getAgentGraph>>["stream"]
>[0];

function graphInput(runId: string, input: RunInput): GraphInput {
  switch (input.kind) {
    case "start":
      return { documentId: input.documentId, runId };
    case "resume":
      return new Command({ resume: input.resume });
    case "retry":
      return null;
  }
}

// Executes the graph for one run and relays everything its nodes emit to
// the event bus. Meant to be called in the background (see the routes'
// after()), never awaited by a request: the run must keep going when the
// browser that started it disconnects.
//
// graph.stream() with streamMode "custom" yields exactly what nodes pass
// to config.writer — our RunEvents — in order. The other stream modes
// ("updates", "values") yield graph state after each node, which is too
// coarse: they can't express "requirement 5 of 12 just finished".
export async function executeRun(runId: string, input: RunInput) {
  runEventBus.markActive(runId);
  // thread_id ties this execution to the run's saved checkpoints.
  const config = { configurable: { thread_id: runId } };
  try {
    const graph = await getAgentGraph();
    const stream = await graph.stream(graphInput(runId, input), {
      ...config,
      streamMode: "custom",
    });
    for await (const chunk of stream) {
      // Nodes only ever write RunEvents, but the writer is typed unknown;
      // parsing keeps a malformed event from ever reaching a browser.
      const event = RunEventSchema.safeParse(chunk);
      if (event.success) runEventBus.publish(runId, event.data);
    }

    // The stream ends both when the graph finishes and when it pauses at
    // interrupt(); the saved state tells the two apart.
    const snapshot = await graph.getState(config);
    const paused = snapshot.tasks.some((task) => task.interrupts.length > 0);
    await updateRun(
      runId,
      paused
        ? { status: "waiting_for_review" }
        : { status: "completed", finishedAt: new Date() },
    );
  } catch (error) {
    console.error(`Run ${runId} failed`, error);
    await updateRun(runId, {
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
      rateLimited: isRateLimitError(error),
    });
  } finally {
    runEventBus.markInactive(runId);
  }
}

// Atomically moves a run from one of `from` to "running", so two clicks
// (or two tabs) can't both resume or retry it. False if it wasn't in an
// allowed status.
export async function claimRun(
  runId: string,
  from: RunSummary["status"][],
): Promise<boolean> {
  const [row] = await db
    .update(runs)
    .set({ status: "running", error: null, rateLimited: false, finishedAt: null })
    .where(and(eq(runs.id, runId), inArray(runs.status, from)))
    .returning();
  if (!row) return false;
  runEventBus.publish(runId, { type: "run", run: toRunSummary(row) });
  return true;
}

// Whether the graph has a saved place to continue from. A run from before
// checkpointing existed has none, so there's nothing to retry.
export async function hasCheckpointToContinue(runId: string): Promise<boolean> {
  const graph = await getAgentGraph();
  const snapshot = await graph.getState({ configurable: { thread_id: runId } });
  return snapshot.next.length > 0;
}

// getRunDetail, plus one repair: a run the DB says is "running" but that
// no code in this process is executing was cut off by a server restart.
// Left alone it would show a spinner forever, so it's marked failed (along
// with the step it was in), which gives the user a Retry button instead.
export async function loadRunDetail(runId: string): Promise<RunDetail | null> {
  const detail = await getRunDetail(runId);
  if (detail?.run.status !== "running" || runEventBus.isActive(runId)) {
    return detail;
  }

  await db
    .update(agentRuns)
    .set({ status: "failed", finishedAt: new Date(), error: "Interrupted" })
    .where(and(eq(agentRuns.runId, runId), eq(agentRuns.status, "running")));
  await updateRun(runId, {
    status: "failed",
    finishedAt: new Date(),
    error: "The server restarted while this run was in progress.",
  });
  return getRunDetail(runId);
}
