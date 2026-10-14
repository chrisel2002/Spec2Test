import { NextResponse } from "next/server";

import { getRunSummaryCounts } from "@/lib/db/queries";
import { buildRunSummary } from "@/lib/voice/text";

export const dynamic = "force-dynamic";

// A one-sentence run summary built from database counts. Kept separate
// from /api/voice so that route stays a generic text-to-speech endpoint.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const counts = await getRunSummaryCounts(documentId);

  return NextResponse.json({ summary: buildRunSummary(counts), counts });
}
