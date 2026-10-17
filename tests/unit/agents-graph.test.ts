import { describe, expect, it } from "vitest";

import { shouldContinueAfterExtraction } from "@/lib/agents/routing";
import type { AgentState } from "@/lib/agents/state";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    documentId: "doc-1",
    runId: "run-1",
    requirements: [],
    testCases: [],
    stopReason: null,
    reviewedBy: null,
    ...overrides,
  };
}

describe("shouldContinueAfterExtraction", () => {
  it("routes to stop when no requirements were extracted", () => {
    expect(shouldContinueAfterExtraction(makeState({ requirements: [] }))).toBe(
      "stop",
    );
  });

  it("routes to continue when at least one requirement was extracted", () => {
    const state = makeState({
      requirements: [
        {
          id: "REQ-01",
          title: "A",
          text: "The system shall do A.",
          sourceChunkIds: ["chunk-1"],
          isAmbiguous: false,
          ambiguityReason: null,
          suggestedRewrite: null,
        },
      ],
    });

    expect(shouldContinueAfterExtraction(state)).toBe("continue");
  });
});
