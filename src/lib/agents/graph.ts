import { StateGraph, START, END } from "@langchain/langgraph";

import { checkAmbiguityNode } from "./nodes/check-ambiguity-node";
import { extractRequirementsNode } from "./nodes/extract-requirements-node";
import { generateTestsNode } from "./nodes/generate-tests-node";
import { shouldContinueAfterExtraction } from "./routing";
import { AgentStateSchema } from "./state";

export const agentGraph = new StateGraph(AgentStateSchema)
  .addNode("extractRequirements", extractRequirementsNode)
  .addNode("checkAmbiguity", checkAmbiguityNode)
  .addNode("generateTests", generateTestsNode)
  .addEdge(START, "extractRequirements")
  .addConditionalEdges("extractRequirements", shouldContinueAfterExtraction, {
    stop: END,
    continue: "checkAmbiguity",
  })
  .addEdge("checkAmbiguity", "generateTests")
  .addEdge("generateTests", END)
  .compile();
