import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requirements as requirementsTable } from "@/lib/db/schema";
import { toRequirementView } from "@/lib/runs/views";

import { checkAmbiguityForRequirements } from "./check-ambiguity";
import type { AgentState } from "../state";
import { emitterFrom, trackStep } from "../tracking";

const STEP = "check_ambiguity";

// Graph node: runs the pure ambiguity check under step tracking, saves and
// streams each batch's flag/reason/rewrite, and passes the updated
// requirements on to the next node. Updates overwrite, so a retry is safe.
export async function checkAmbiguityNode(
  state: AgentState,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentState>> {
  const emit = emitterFrom(config);
  const ctx = { documentId: state.documentId, runId: state.runId, emit };

  const requirements = await trackStep(ctx, STEP, async () => {
    emit({
      type: "progress",
      step: STEP,
      done: 0,
      total: state.requirements.length,
    });

    const { requirements, usage } = await checkAmbiguityForRequirements(
      state.requirements,
      {
        onBatch: async (batch, progress) => {
          const rows = [];
          for (const requirement of batch) {
            const [row] = await db
              .update(requirementsTable)
              .set({
                isAmbiguous: requirement.isAmbiguous,
                ambiguityReason: requirement.ambiguityReason,
                suggestedRewrite: requirement.suggestedRewrite,
              })
              .where(
                and(
                  eq(requirementsTable.runId, state.runId),
                  eq(requirementsTable.code, requirement.id),
                ),
              )
              .returning();
            if (row) rows.push(row);
          }
          emit({
            type: "requirements",
            requirements: rows.map(toRequirementView),
          });
          emit({ type: "progress", step: STEP, ...progress });
        },
      },
    );

    return { result: requirements, usage };
  });

  return { requirements };
}
