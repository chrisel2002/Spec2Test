import { z } from "zod";

import { RequirementSchema, TestCaseSchema } from "./schemas";

// Graph state, passed to every node and partially updated by each node's
// return value (LangGraph shallow-merges a node's return into state — see
// the "State design" note in the PR/commit message for why no field here
// needs a custom reducer).
export const AgentStateSchema = z.object({
  // Set once before the graph runs; read by every node, written by none.
  documentId: z.string(),
  runId: z.string(),

  // Built up by node 1, read and annotated in place by node 2.
  requirements: z.array(RequirementSchema).default([]),

  // Built up by node 3.
  testCases: z.array(TestCaseSchema).default([]),

  // Set by node 1 when it finds zero requirements; read by the conditional
  // edge that routes straight to END instead of running nodes 2 and 3.
  stopReason: z.string().nullable().default(null),

  // Set when the human-review checkpoint is resumed: who clicked
  // "Build matrix".
  reviewedBy: z.string().nullable().default(null),
});
export type AgentState = z.infer<typeof AgentStateSchema>;
