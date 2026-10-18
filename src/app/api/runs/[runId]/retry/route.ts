import { after } from "next/server";

import { respond } from "@/lib/services/http";
import { retryRun } from "@/lib/services/runs";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

// Retries a failed run from its last checkpoint.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const limited = rateLimit(request, "model");
  if (limited) return limited;
  const { runId } = await params;
  return respond(
    async () => {
      await retryRun(runId, after);
      return { ok: true };
    },
    { fallbackError: "Couldn't retry the run", status: 202 },
  );
}
