import { randomUUID } from "node:crypto";

import { StateGraph, START, END } from "@langchain/langgraph";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";

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

  // Each run keeps its own requirements and test cases, so re-running no
  // longer replaces the previous run's results.
  await db.insert(runs).values({ id: runId, documentId });

  try {
    const state = await graph.invoke({ documentId, runId });
    await db
      .update(runs)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(runs.id, runId));
    return state;
  } catch (error) {
    await db
      .update(runs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(runs.id, runId));
    throw error;
  }
}
