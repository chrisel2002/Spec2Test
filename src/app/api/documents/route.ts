import { NextResponse } from "next/server";

import { ingestSpec, listDocuments } from "@/lib/services/documents";
import { errorResponse } from "@/lib/services/http";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimit(request, "upload");
  if (limited) return limited;
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  try {
    const result = await ingestSpec({
      filename: file.name,
      data: Buffer.from(await file.arrayBuffer()),
    });
    // 202 Accepted: the document is stored but embedding is paused until
    // the quota frees up. The body's statusMessage says why.
    return NextResponse.json(result, {
      status: result.status === "waiting" ? 202 : 200,
    });
  } catch (error) {
    return errorResponse(error, "Ingestion failed");
  }
}

export async function GET() {
  return NextResponse.json(await listDocuments());
}
