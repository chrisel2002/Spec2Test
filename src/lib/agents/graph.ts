import { randomUUID } from "node:crypto";

import { StateGraph, START, END } from "@langchain/langgraph";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requirements as requirementsTable } from "@/lib/db/schema";

import { checkAmbiguityNode } from "./nodes/check-ambiguity-node";
import { extractRequirementsNode } from "./nodes/extract-requirements-node";
import { generateTestsNode } from "./nodes/generate-tests-node";
import { shouldContinueAfterExtraction } from "./routing";
import { AgentStateSchema, type AgentState } from "./state";

const graph = new StateGraph(AgentStateSchema)
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

export async function runAgentPipeline(documentId: string): Promise<AgentState> {
  const runId = randomUUID();

  // A document's requirements/test_cases are a single current snapshot, not
  // an accumulating history — re-running replaces the previous set rather
  // than piling duplicates on top of it. Cascades to test_cases via FK.
  await db
    .delete(requirementsTable)
    .where(eq(requirementsTable.documentId, documentId));

  return graph.invoke({ documentId, runId });
}
