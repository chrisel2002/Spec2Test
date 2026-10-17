import "server-only";

import { and, eq } from "drizzle-orm";

import {
  claimRun,
  createRun,
  executeRun,
  hasCheckpointToContinue,
  isRunAlive,
  loadRunDetail,
  type RunInput,
} from "@/lib/agents/runner";
import { db } from "@/lib/db/client";
import {
  getLatestRunId,
  getRunSummaryCounts,
  listRunsForDocument,
} from "@/lib/db/queries";
import { runs } from "@/lib/db/schema";
import { runEventBus } from "@/lib/runs/event-bus";
import type { RunDetail, RunStatus, RunSummary } from "@/lib/runs/types";
import { buildRunSummary } from "@/lib/voice/text";

import { getDocument } from "./documents";
import { requireUuid, ServiceError } from "./errors";

// How a caller runs work in the background. A run takes minutes, so no
// caller awaits it: the web app passes Next.js's after() (which keeps the
// work alive once the response is sent), the MCP server, a long-lived
// process, simply starts the promise and lets it run.
export type Schedule = (task: () => Promise<void>) => void;

// Where a human reviews a run in the web app. Shared with the MCP server,
// which hands this link to the agent when a run is waiting for review.
export function reviewUrl(runId: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/?run=${runId}`;
}

export async function getRun(runId: string): Promise<RunDetail> {
  const detail = await loadRunDetail(requireUuid(runId, "run"));
  if (!detail) throw new ServiceError("Run not found", "not_found");
  return detail;
}

export async function getLatestRun(documentId: string): Promise<RunDetail | null> {
  const runId = await getLatestRunId(requireUuid(documentId, "document"));
  return runId ? getRun(runId) : null;
}

export function listRuns(documentId: string): Promise<RunSummary[]> {
  return listRunsForDocument(requireUuid(documentId, "document"));
}

export async function startRun(documentId: string, schedule: Schedule): Promise<RunSummary> {
  const document = await getDocument(documentId);
  if (document.status !== "ready") {
    throw new ServiceError("This document hasn't finished embedding yet.", "conflict");
  }

  const [inProgress] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.documentId, document.id), eq(runs.status, "running")));
  if (inProgress && (await isRunAlive(inProgress.id))) {
    throw new ServiceError("A run is already in progress for this document.", "conflict");
  }

  const run = await createRun(document.id);
  // Marked active before returning, not inside the scheduled task: the
  // caller may look at the run straight away and must not mistake a run
  // that hasn't started yet for one a restart cut off.
  runEventBus.markActive(run.id);
  schedule(() => executeRun(run.id, { kind: "start", documentId: document.id }));
  return run;
}

// Shared by resume and retry: check the status (for a clear error), check
// there's a checkpoint to continue from, atomically claim the run, and
// continue the graph in the background.
async function continueRun(
  rawRunId: string,
  from: RunStatus,
  input: RunInput,
  notAllowed: string,
  schedule: Schedule,
): Promise<void> {
  const runId = requireUuid(rawRunId, "run");
  const [run] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
  if (!run) throw new ServiceError("Run not found", "not_found");
  if (run.status !== from) throw new ServiceError(notAllowed, "conflict");
  if (!(await hasCheckpointToContinue(runId))) {
    throw new ServiceError(
      "This run has no saved progress to continue from. Start a new run.",
      "conflict",
    );
  }
  // The status check above gives a clear message; this claim is what
  // actually guarantees only one request continues the run.
  if (!(await claimRun(runId, [from]))) throw new ServiceError(notAllowed, "conflict");

  runEventBus.markActive(runId);
  schedule(() => executeRun(runId, input));
}

// "Build matrix": the human has finished reviewing. Only the web app calls
// this — the MCP server deliberately has no tool for it.
export function resumeRun(runId: string, actor: string, schedule: Schedule) {
  return continueRun(
    runId,
    "waiting_for_review",
    { kind: "resume", resume: { reviewedBy: actor } },
    "This run isn't waiting for review.",
    schedule,
  );
}

// Retries a failed run from its last checkpoint: steps that already
// succeeded aren't repeated (or paid for) again.
export function retryRun(runId: string, schedule: Schedule) {
  return continueRun(
    runId,
    "failed",
    { kind: "retry" },
    "Only a failed run can be retried.",
    schedule,
  );
}

export async function getRunSpokenSummary(runId: string) {
  const counts = await getRunSummaryCounts(requireUuid(runId, "run"));
  return { summary: buildRunSummary(counts), counts };
}
