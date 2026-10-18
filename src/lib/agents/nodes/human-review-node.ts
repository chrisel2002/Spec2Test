import { interrupt } from "@langchain/langgraph";

import type { AgentState } from "../state";

// What the graph exposes while paused, and what a resume must supply.
type ReviewCheckpoint = { runId: string; reason: "waiting_for_review" };
export type ReviewResume = { reviewedBy: string };

// The human-in-the-loop checkpoint. interrupt() stops the graph here: the
// checkpointer has already saved state, the stream ends, and the run sits
// in "waiting for review" for as long as the human needs — minutes or
// days, with no process waiting on it.
//
// Resuming (graph.stream(new Command({ resume: { reviewedBy } }))) runs
// this node again *from the top*, and this time interrupt() returns the
// resume value instead of stopping. That re-execution is why nothing with
// a side effect may come before the interrupt() call.
export function humanReviewNode(state: AgentState): Partial<AgentState> {
  const { reviewedBy } = interrupt<ReviewCheckpoint, ReviewResume>({
    runId: state.runId,
    reason: "waiting_for_review",
  });
  return { reviewedBy };
}
