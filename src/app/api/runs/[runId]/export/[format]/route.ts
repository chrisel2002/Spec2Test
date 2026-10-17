import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/services/http";
import { type ExportFile, exportCsv } from "@/lib/services/exports";

export const dynamic = "force-dynamic";

const EXPORTERS: Record<string, (runId: string, url: URL) => Promise<ExportFile>> = {
  csv: (runId, url) =>
    exportCsv(runId, { approvedOnly: url.searchParams.get("approvedOnly") === "true" }),
};

// Downloads an export of a run: /api/runs/:runId/export/csv[?approvedOnly=true].
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string; format: string }> },
) {
  const { runId, format } = await params;
  const exporter = EXPORTERS[format];
  if (!exporter) {
    return NextResponse.json({ error: "Unknown export format" }, { status: 404 });
  }

  try {
    const file = await exporter(runId, new URL(request.url));
    return new Response(file.body as BodyInit, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Export failed");
  }
}
