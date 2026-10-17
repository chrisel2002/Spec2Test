import "server-only";

import { exportAvailability, type ExportFormat } from "@/lib/export/availability";
import { buildMatrixCsv } from "@/lib/export/csv";
import { type ExportInput, slugify } from "@/lib/export/shared";

import { getDocument } from "./documents";
import { ServiceError } from "./errors";
import { getRun } from "./runs";

export type ExportFile = {
  filename: string;
  contentType: string;
  body: string | Uint8Array;
};

// Loads a run for exporting and enforces the same availability rules the
// export buttons show, so a direct API call or MCP tool call can't export
// a run that isn't signed off.
async function loadForExport(
  runId: string,
  format: ExportFormat,
  options: { approvedOnly?: boolean } = {},
): Promise<ExportInput> {
  const detail = await getRun(runId);
  const availability = exportAvailability(detail, format, options);
  if (!availability.enabled) throw new ServiceError(availability.reason, "conflict");
  const document = await getDocument(detail.run.documentId);
  return { detail, documentFilename: document.filename };
}

function baseName(input: ExportInput): string {
  return `${slugify(input.documentFilename)}-run-${input.detail.run.id.slice(0, 8)}`;
}

export async function exportCsv(
  runId: string,
  { approvedOnly = false }: { approvedOnly?: boolean } = {},
): Promise<ExportFile> {
  const input = await loadForExport(runId, "csv", { approvedOnly });
  return {
    filename: `${baseName(input)}-matrix${approvedOnly ? "-approved" : ""}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: buildMatrixCsv(input, { approvedOnly }),
  };
}
