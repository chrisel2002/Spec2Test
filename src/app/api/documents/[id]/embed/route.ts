import { NextResponse } from "next/server";

import { resumeEmbedding } from "@/lib/services/documents";
import { errorResponse } from "@/lib/services/http";
import { requireAccess } from "@/lib/services/access";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

// Resumes a document whose embedding was paused or failed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, "upload");
  if (limited) return limited;
  try {
    const result = await resumeEmbedding((await params).id);
    return NextResponse.json(result, {
      status: result.status === "waiting" ? 202 : 200,
    });
  } catch (error) {
    return errorResponse(error, "Embedding failed unexpectedly");
  }
}
