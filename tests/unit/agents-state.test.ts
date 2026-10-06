import { describe, expect, it } from "vitest";

import { AgentStateSchema } from "@/lib/agents/state";

describe("AgentStateSchema", () => {
  it("defaults requirements, testCases, and stopReason when only the IDs are given", () => {
    const state = AgentStateSchema.parse({
      documentId: "doc-1",
      runId: "run-1",
    });

    expect(state.requirements).toEqual([]);
    expect(state.testCases).toEqual([]);
    expect(state.stopReason).toBeNull();
  });

  it("requires documentId and runId", () => {
    expect(AgentStateSchema.safeParse({}).success).toBe(false);
  });
});
