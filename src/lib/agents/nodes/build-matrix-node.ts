import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { getRunDetail } from "@/lib/db/queries";
import { runs } from "@/lib/db/schema";
import { calculateCoverage } from "@/lib/review/coverage";
import { toRunSummary } from "@/lib/runs/views";

import type { AgentState } from "../state";
import { emitterFrom, trackStep } from "../tracking";
import { emptyUsage } from "../usage";

// Runs after the human review. Reads requirements and tests from the DB,
// not from graph state: during review, people approved, edited, and
// rewrote things, and those changes live in the DB — the graph's copy is
// whatever node 3 produced before the pause.
//
// The matrix itself is a view over that reviewed data; what this node
// adds is the sign-off: it records the coverage at this moment on the run,
// and the run then completes, which closes it for further review.
export async function buildMatrixNode(
  state: AgentState,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentState>> {
  const emit = emitterFrom(config);
  const ctx = { documentId: state.documentId, runId: state.runId, emit };

  await trackStep(ctx, "build_matrix", async () => {
    const detail = await getRunDetail(state.runId);
    const { covered, total } = calculateCoverage(
      detail?.requirements ?? [],
      detail?.testCases ?? [],
    );

    const [row] = await db
      .update(runs)
      .set({ coverage: { covered, total } })
      .where(eq(runs.id, state.runId))
      .returning();
    emit({ type: "run", run: toRunSummary(row) });

    // No model call in this step, so no tokens and no cost.
    return { result: null, usage: emptyUsage() };
  });

  return {};
}
