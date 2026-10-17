import { NextResponse } from "next/server";
import { z } from "zod";

import { createRunEventStream } from "@/lib/runs/sse";

export const dynamic = "force-dynamic";

// Server-sent events: the browser opens this with EventSource and gets a
// snapshot followed by live progress. See createRunEventStream.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).runId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  return new Response(createRunEventStream(parsedId.data, request.signal), {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform stops proxies from buffering or compressing the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
