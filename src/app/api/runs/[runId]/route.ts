import { NextResponse } from "next/server";
import { z } from "zod";

import { loadRunDetail } from "@/lib/agents/runner";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).runId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const detail = await loadRunDetail(parsedId.data);
  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
