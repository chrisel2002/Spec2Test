import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { embedPendingChunks } from "@/lib/ingest/pipeline";

export const dynamic = "force-dynamic";

// Resumes a document whose embedding was paused ("waiting") or stopped
// ("failed"). Only chunks still missing an embedding are sent, so no
// quota is spent twice on the same chunk.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  const documentId = parsedId.data;

  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    const result = await embedPendingChunks(documentId);
    return NextResponse.json(result, {
      status: result.status === "waiting" ? 202 : 200,
    });
  } catch (error) {
    console.error("Resuming embedding failed", error);
    return NextResponse.json(
      { error: "Embedding failed unexpectedly" },
      { status: 500 },
    );
  }
}
