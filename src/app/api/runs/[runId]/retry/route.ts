import { continueRun } from "@/lib/runs/continue-run";

export const dynamic = "force-dynamic";

// Retries a failed run from its last checkpoint: steps that already
// succeeded aren't repeated (or paid for) again.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  return continueRun(
    (await params).runId,
    "failed",
    { kind: "retry" },
    { notAllowed: "Only a failed run can be retried." },
  );
}
