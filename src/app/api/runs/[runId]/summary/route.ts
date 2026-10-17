import { respond } from "@/lib/services/http";
import { getRunSpokenSummary } from "@/lib/services/runs";

export const dynamic = "force-dynamic";

// A one-sentence run summary built from database counts. Kept separate
// from /api/voice so that route stays a generic text-to-speech endpoint.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return respond(() => getRunSpokenSummary(runId), {
    fallbackError: "Couldn't build the summary",
  });
}
