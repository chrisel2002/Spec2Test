import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { listChunksForDocument } from "@/lib/db/queries";
import { requirements as requirementsTable } from "@/lib/db/schema";
import { toRequirementView } from "@/lib/runs/views";

import { extractRequirementsFromChunks } from "./extract-requirements";
import type { AgentState } from "../state";
import { emitterFrom, trackStep } from "../tracking";

const STEP = "extract_requirements";

// Graph node: fetches this document's chunks, runs the pure extraction
// logic under step tracking, saves and streams each batch's requirements
// as it's extracted, and reports whether to stop the run early. Kept
// separate from extract-requirements.ts so that file's pure logic can be
// unit tested without needing DATABASE_URL set (importing `db` throws
// immediately if it isn't).
export async function extractRequirementsNode(
  state: AgentState,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentState>> {
  const emit = emitterFrom(config);
  const ctx = { documentId: state.documentId, runId: state.runId, emit };

  const requirements = await trackStep(ctx, STEP, async () => {
    // A retry re-runs this node from the start, so clear anything a failed
    // attempt saved before its error. Without this, retries would duplicate.
    await db
      .delete(requirementsTable)
      .where(eq(requirementsTable.runId, state.runId));

    const chunks = await listChunksForDocument(state.documentId);
    emit({ type: "progress", step: STEP, done: 0, total: chunks.length });

    const { requirements, usage } = await extractRequirementsFromChunks(
      chunks,
      {
        onBatch: async (batch, progress) => {
          if (batch.length > 0) {
            const rows = await db
              .insert(requirementsTable)
              .values(
                batch.map((r) => ({
                  documentId: state.documentId,
                  runId: state.runId,
                  code: r.id,
                  title: r.title,
                  text: r.text,
                  sourceChunkIds: r.sourceChunkIds,
                })),
              )
              .returning();
            emit({
              type: "requirements",
              requirements: rows.map(toRequirementView),
            });
          }
          emit({ type: "progress", step: STEP, ...progress });
        },
      },
    );

    return { result: requirements, usage };
  });

  return {
    requirements,
    stopReason:
      requirements.length === 0
        ? "No requirements were found in this document."
        : null,
  };
}
