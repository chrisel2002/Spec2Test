import { db } from "@/lib/db/client";
import { listChunksForDocument } from "@/lib/db/queries";
import { requirements as requirementsTable } from "@/lib/db/schema";

import { extractRequirementsFromChunks } from "./extract-requirements";
import type { AgentState } from "../state";
import { trackStep } from "../tracking";

// Graph node: fetches this document's chunks, runs the pure extraction
// logic under step tracking, persists the result, and reports whether to
// stop the run early. Kept separate from extract-requirements.ts so that
// file's pure logic can be unit tested without needing DATABASE_URL set
// (importing `db` throws immediately if it isn't).
export async function extractRequirementsNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const requirements = await trackStep(
    state.documentId,
    state.runId,
    "extract_requirements",
    async () => {
      const chunks = await listChunksForDocument(state.documentId);
      const { requirements, usage } = await extractRequirementsFromChunks(
        chunks,
      );

      if (requirements.length > 0) {
        await db.insert(requirementsTable).values(
          requirements.map((r) => ({
            documentId: state.documentId,
            code: r.id,
            title: r.title,
            text: r.text,
            sourceChunkIds: r.sourceChunkIds,
            isAmbiguous: r.isAmbiguous,
            ambiguityReason: r.ambiguityReason,
            suggestedRewrite: r.suggestedRewrite,
          })),
        );
      }

      return { result: requirements, usage };
    },
  );

  return {
    requirements,
    stopReason:
      requirements.length === 0
        ? "No requirements were found in this document."
        : null,
  };
}
