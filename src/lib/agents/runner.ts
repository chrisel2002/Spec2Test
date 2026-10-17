import "server-only";

import { and, eq } from "drizzle-orm";

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

import { agentGraph } from "./graph";

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

// Executes the graph for one run and relays everything its nodes emit to
// the event bus. Meant to be called in the background (see the route's
// after()), never awaited by a request: the run must keep going when the
// browser that started it disconnects.
//
// graph.stream() with streamMode "custom" yields exactly what nodes pass
// to config.writer — our RunEvents — in order. The other stream modes
// ("updates", "values") yield graph state after each node, which is too
// coarse: they can't express "requirement 5 of 12 just finished".
export async function executeRun(runId: string, documentId: string) {
  runEventBus.markActive(runId);
  try {
    const stream = await agentGraph.stream(
      { documentId, runId },
      { streamMode: "custom" },
    );
    for await (const chunk of stream) {
      // Nodes only ever write RunEvents, but the writer is typed unknown;
      // parsing keeps a malformed event from ever reaching a browser.
      const event = RunEventSchema.safeParse(chunk);
      if (event.success) runEventBus.publish(runId, event.data);
    }

    await updateRun(runId, { status: "completed", finishedAt: new Date() });
  } catch (error) {
    console.error(`Run ${runId} failed`, error);
    await updateRun(runId, {
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    runEventBus.markInactive(runId);
  }
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
