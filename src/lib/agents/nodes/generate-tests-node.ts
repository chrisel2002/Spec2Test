import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requirements as requirementsTable, testCases as testCasesTable } from "@/lib/db/schema";

import { generateTestsForRequirements } from "./generate-tests";
import type { AgentState } from "../state";
import { trackStep } from "../tracking";

// Graph node: generates tests for every requirement (ambiguous ones via
// their suggested rewrite — see effectiveText in generate-tests.ts), under
// step tracking, and persists them linked to each requirement's DB row.
export async function generateTestsNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const testCases = await trackStep(
    state.documentId,
    state.runId,
    "generate_tests",
    async () => {
      const { testCases, usage } = await generateTestsForRequirements(
        state.requirements,
      );

      if (testCases.length > 0) {
        const requirementRows = await db
          .select({ id: requirementsTable.id, code: requirementsTable.code })
          .from(requirementsTable)
          .where(eq(requirementsTable.runId, state.runId));
        const codeToId = new Map(requirementRows.map((r) => [r.code, r.id]));

        await db.insert(testCasesTable).values(
          testCases.flatMap((tc) => {
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
          }),
        );
      }

      return { result: testCases, usage };
    },
  );

  return { testCases };
}
