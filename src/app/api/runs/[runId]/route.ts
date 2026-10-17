import { respond } from "@/lib/services/http";
import { getRun } from "@/lib/services/runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return respond(() => getRun(runId), { fallbackError: "Couldn't load the run" });
}
