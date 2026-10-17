import { NextResponse } from "next/server";
import { z } from "zod";

import { getRunSummaryCounts } from "@/lib/db/queries";
import { buildRunSummary } from "@/lib/voice/text";

export const dynamic = "force-dynamic";

// A one-sentence run summary built from database counts. Kept separate
// from /api/voice so that route stays a generic text-to-speech endpoint.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).runId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const counts = await getRunSummaryCounts(parsedId.data);
  return NextResponse.json({ summary: buildRunSummary(counts), counts });
}
