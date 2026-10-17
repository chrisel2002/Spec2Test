import "server-only";

import { StateGraph, START, END } from "@langchain/langgraph";

import { getCheckpointer } from "./checkpointer";
import { buildMatrixNode } from "./nodes/build-matrix-node";
import { checkAmbiguityNode } from "./nodes/check-ambiguity-node";
import { extractRequirementsNode } from "./nodes/extract-requirements-node";
import { generateTestsNode } from "./nodes/generate-tests-node";
import { humanReviewNode } from "./nodes/human-review-node";
import { shouldContinueAfterExtraction } from "./routing";
import { AgentStateSchema } from "./state";

const builder = new StateGraph(AgentStateSchema)
  .addNode("extractRequirements", extractRequirementsNode)
  .addNode("checkAmbiguity", checkAmbiguityNode)
  .addNode("generateTests", generateTestsNode)
  .addNode("humanReview", humanReviewNode)
  .addNode("buildMatrix", buildMatrixNode)
  .addEdge(START, "extractRequirements")
  .addConditionalEdges("extractRequirements", shouldContinueAfterExtraction, {
    stop: END,
    continue: "checkAmbiguity",
  })
  .addEdge("checkAmbiguity", "generateTests")
  // The run pauses inside humanReview (interrupt()) until a person has
  // reviewed the tests and clicks "Build matrix".
  .addEdge("generateTests", "humanReview")
  .addEdge("humanReview", "buildMatrix")
  .addEdge("buildMatrix", END);

const globalForGraph = globalThis as unknown as {
  agentGraph?: Promise<ReturnType<typeof builder.compile>>;
};

// Compiled once per process, with the Postgres checkpointer attached.
// Without a checkpointer, interrupt() couldn't pause anything: there would
// be nowhere to save the state to resume from.
export function getAgentGraph() {
  globalForGraph.agentGraph ??= getCheckpointer().then((checkpointer) =>
    builder.compile({ checkpointer }),
  );
  return globalForGraph.agentGraph;
}
