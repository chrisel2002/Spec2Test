import { after } from "next/server";

import { respond } from "@/lib/services/http";
import { retryRun } from "@/lib/services/runs";

export const dynamic = "force-dynamic";

// Retries a failed run from its last checkpoint.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return respond(
    async () => {
      await retryRun(runId, after);
      return { ok: true };
    },
    { fallbackError: "Couldn't retry the run", status: 202 },
  );
}
