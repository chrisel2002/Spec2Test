import type { AgentState } from "./state";

// Exported separately from graph.ts so this can be unit tested without
// constructing a graph or mocking the DB/model — it's pure state in,
// routing decision out.
export function shouldContinueAfterExtraction(
  state: AgentState,
): "stop" | "continue" {
  return state.requirements.length === 0 ? "stop" : "continue";
}
