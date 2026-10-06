import { NextResponse } from "next/server";

import { runAgentPipeline } from "@/lib/agents/graph";
import {
  getLatestRunSteps,
  listRequirementsWithTestCases,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// Runs synchronously and returns the final result — today's scope is a
// "start a run, see the results" button, not live progress streaming
// (that's day 4). Small batch sizes keep a full run to roughly a dozen
// sequential LLM calls, well inside typical request timeouts.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;

  try {
    const state = await runAgentPipeline(documentId);
    return NextResponse.json({
      stopReason: state.stopReason,
      requirementCount: state.requirements.length,
      testCaseCount: state.testCases.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run failed" },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;

  const [steps, requirements] = await Promise.all([
    getLatestRunSteps(documentId),
    listRequirementsWithTestCases(documentId),
  ]);

  return NextResponse.json({ steps, requirements });
}
