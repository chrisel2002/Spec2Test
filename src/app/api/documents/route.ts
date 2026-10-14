import { NextResponse } from "next/server";
import { z } from "zod";

import { listDocumentSummaries } from "@/lib/db/queries";
import { ingestDocument } from "@/lib/ingest/pipeline";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".md", ".pdf"];

// Browsers report an unreliable (often empty) MIME type for .md files, so
// validation here goes by extension instead of the client-supplied type.
const uploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, "File is empty")
    .refine((f) => f.size <= MAX_FILE_SIZE, "File exceeds the 10 MB limit")
    .refine(
      (f) =>
        ALLOWED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
      "Only .md and .pdf files are supported",
    ),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = uploadSchema.safeParse({ file: formData.get("file") });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload" },
      { status: 400 },
    );
  }

  const { file } = parsed.data;
  const mimeType = file.name.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "text/markdown";

  try {
    const result = await ingestDocument({
      filename: file.name,
      mimeType,
      data: Buffer.from(await file.arrayBuffer()),
    });
    // 202 Accepted: the document is stored but embedding is paused until
    // the quota frees up. The body's statusMessage says why.
    return NextResponse.json(result, {
      status: result.status === "waiting" ? 202 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(await listDocumentSummaries());
}
