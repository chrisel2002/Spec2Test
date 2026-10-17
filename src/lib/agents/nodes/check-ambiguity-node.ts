import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requirements as requirementsTable } from "@/lib/db/schema";

import { checkAmbiguityForRequirements } from "./check-ambiguity";
import type { AgentState } from "../state";
import { trackStep } from "../tracking";

// Graph node: runs the pure ambiguity check under step tracking, persists
// each requirement's flag/reason/rewrite, and passes the updated
// requirements on to the next node.
export async function checkAmbiguityNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const requirements = await trackStep(
    state.documentId,
    state.runId,
    "check_ambiguity",
    async () => {
      const { requirements, usage } = await checkAmbiguityForRequirements(
        state.requirements,
      );

      for (const requirement of requirements) {
        await db
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
          );
      }

      return { result: requirements, usage };
    },
  );

  return { requirements };
}
