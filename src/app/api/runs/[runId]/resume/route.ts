import { after, NextResponse } from "next/server";
import { z } from "zod";

import { ActorSchema } from "@/lib/review/transitions";
import { respond } from "@/lib/services/http";
import { resumeRun } from "@/lib/services/runs";

export const dynamic = "force-dynamic";

const ResumeSchema = z.object({ actor: ActorSchema });

// "Build matrix": resumes a run paused at the human-review checkpoint.
// Body: { actor }, recorded in graph state as who signed off.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const body = ResumeSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { runId } = await params;
  return respond(
    async () => {
      await resumeRun(runId, body.data.actor, after);
      return { ok: true };
    },
    { fallbackError: "Couldn't resume the run", status: 202 },
  );
}
