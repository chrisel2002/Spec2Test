import { NextResponse } from "next/server";

import { resumeEmbedding } from "@/lib/services/documents";
import { errorResponse } from "@/lib/services/http";

export const dynamic = "force-dynamic";

// Resumes a document whose embedding was paused or failed.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await resumeEmbedding((await params).id);
    return NextResponse.json(result, {
      status: result.status === "waiting" ? 202 : 200,
    });
  } catch (error) {
    return errorResponse(error, "Embedding failed unexpectedly");
  }
}
