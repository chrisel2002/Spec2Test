import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  requirements as requirementsTable,
  testCases as testCasesTable,
} from "@/lib/db/schema";
import { toTestCaseView } from "@/lib/runs/views";

import { generateTestsForRequirements } from "./generate-tests";
import type { AgentState } from "../state";
import { emitterFrom, trackStep } from "../tracking";

const STEP = "generate_tests";

// Graph node: generates tests for every requirement (ambiguous ones via
// their suggested rewrite — see effectiveText in generate-tests.ts), under
// step tracking, and saves and streams each batch linked to its
// requirement's DB row.
export async function generateTestsNode(
  state: AgentState,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentState>> {
  const emit = emitterFrom(config);
  const ctx = { documentId: state.documentId, runId: state.runId, emit };

  const testCases = await trackStep(ctx, STEP, async () => {
    const requirementRows = await db
      .select({ id: requirementsTable.id, code: requirementsTable.code })
      .from(requirementsTable)
      .where(eq(requirementsTable.runId, state.runId));
    const codeToId = new Map(requirementRows.map((r) => [r.code, r.id]));

    // Same idempotency rule as extraction: a retry starts from a clean slate.
    if (requirementRows.length > 0) {
      await db.delete(testCasesTable).where(
        inArray(
          testCasesTable.requirementId,
          requirementRows.map((r) => r.id),
        ),
      );
    }

    emit({
      type: "progress",
      step: STEP,
      done: 0,
      total: state.requirements.length,
    });

    const { testCases, usage } = await generateTestsForRequirements(
      state.requirements,
      {
        onBatch: async (batch, progress) => {
          const values = batch.flatMap((tc) => {
            const requirementId = codeToId.get(tc.requirementId);
            if (!requirementId) return [];
            return [
              {
                requirementId,
                title: tc.title,
                type: tc.type,
                given: tc.given,
                when: tc.when,
                then: tc.then,
                basedOnAssumption: tc.basedOnAssumption,
              },
            ];
          });
          if (values.length > 0) {
            const rows = await db
              .insert(testCasesTable)
              .values(values)
              .returning();
            emit({ type: "testCases", testCases: rows.map(toTestCaseView) });
          }
          emit({ type: "progress", step: STEP, ...progress });
        },
      },
    );

    return { result: testCases, usage };
  });

  return { testCases };
}
