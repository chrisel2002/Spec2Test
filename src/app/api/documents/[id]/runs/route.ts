import { after } from "next/server";

import { respond } from "@/lib/services/http";
import { listRuns, startRun } from "@/lib/services/runs";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

// Starts a run and returns immediately with its id; the browser then
// follows progress on /api/runs/:runId/events. The run itself executes in
// after(), which Next.js runs once this response has been sent, so the
// run's lifetime isn't tied to this request.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "model");
  if (limited) return limited;
  const { id } = await params;
  return respond(() => startRun(id, after), {
    fallbackError: "Couldn't start the run",
    status: 202,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return respond(() => listRuns(id), { fallbackError: "Couldn't list runs" });
}
