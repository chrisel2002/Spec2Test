import "server-only";

import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  claimRun,
  executeRun,
  hasCheckpointToContinue,
  type RunInput,
} from "@/lib/agents/runner";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";

import { runEventBus } from "./event-bus";
import type { RunStatus } from "./types";

// Shared by the resume and retry routes: both validate the id, check
// there's a checkpoint to continue from, atomically claim the run, and
// continue the graph in the background. They differ only in which status
// they accept and what they feed the graph.
export async function continueRun(
  rawRunId: string,
  from: RunStatus,
  input: RunInput,
  messages: { notAllowed: string },
) {
  const parsedId = z.uuid().safeParse(rawRunId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }
  const runId = parsedId.data;

  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId));
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== from) {
    return NextResponse.json({ error: messages.notAllowed }, { status: 409 });
  }
  if (!(await hasCheckpointToContinue(runId))) {
    return NextResponse.json(
      { error: "This run has no saved progress to continue from. Start a new run." },
      { status: 409 },
    );
  }
  // The status check above gives a clear error message; this claim is what
  // actually guarantees only one request continues the run.
  if (!(await claimRun(runId, [from]))) {
    return NextResponse.json({ error: messages.notAllowed }, { status: 409 });
  }

  runEventBus.markActive(runId);
  after(() => executeRun(runId, input));
  return NextResponse.json({ ok: true }, { status: 202 });
}
