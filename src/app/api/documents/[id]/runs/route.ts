import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { createRun, executeRun } from "@/lib/agents/runner";
import { db } from "@/lib/db/client";
import { listRunsForDocument } from "@/lib/db/queries";
import { documents, runs } from "@/lib/db/schema";
import { runEventBus } from "@/lib/runs/event-bus";

export const dynamic = "force-dynamic";

async function parseDocumentId(params: Promise<{ id: string }>) {
  const parsed = z.uuid().safeParse((await params).id);
  return parsed.success ? parsed.data : null;
}

// Starts a run and returns immediately with its id; the browser then
// follows progress on /api/runs/:runId/events. The run itself executes in
// after(), which Next.js runs once this response has been sent, so the
// run's lifetime isn't tied to this request (or to the browser staying on
// the page).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const documentId = await parseDocumentId(params);
  if (!documentId) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const [document] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (document.status !== "ready") {
    return NextResponse.json(
      { error: "This document hasn't finished embedding yet." },
      { status: 409 },
    );
  }

  const [inProgress] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.documentId, documentId), eq(runs.status, "running")));
  if (inProgress && runEventBus.isActive(inProgress.id)) {
    return NextResponse.json(
      { error: "A run is already in progress for this document." },
      { status: 409 },
    );
  }

  const run = await createRun(documentId);
  // Marked active before responding, not inside after(): the browser opens
  // the event stream as soon as it has the id, and must not mistake a run
  // that hasn't started yet for one a server restart cut off.
  runEventBus.markActive(run.id);
  after(() => executeRun(run.id, documentId));

  return NextResponse.json(run, { status: 202 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const documentId = await parseDocumentId(params);
  if (!documentId) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  return NextResponse.json(await listRunsForDocument(documentId));
}
