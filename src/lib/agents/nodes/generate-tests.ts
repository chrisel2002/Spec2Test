import { generateStructured } from "@/lib/ai/generate-structured";
import {
  buildTestGenerationPrompt,
  GENERATE_TESTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/generate-tests";

import { type BatchProgress, chunkArray } from "../batch";
import { AgentOutputError } from "../errors";
import { type Requirement, type TestCase, TestGenerationBatchResultSchema } from "../schemas";
import { addUsage, emptyUsage, type Usage } from "../usage";

const REQUIREMENT_BATCH_SIZE = 3;

// A requirement that came back ambiguous has, by definition, text the model
// already judged as not reliably testable — so tests are generated from its
// suggestedRewrite instead, and flagged as based on an assumption since
// they test the rewrite's interpretation rather than the original wording.
export function effectiveText(requirement: Requirement): string {
  return requirement.isAmbiguous && requirement.suggestedRewrite
    ? requirement.suggestedRewrite
    : requirement.text;
}

// Pure logic: batches requirements, asks the model for 2-4 Given/When/Then
// test cases per requirement, and links each one back to its requirement's
// code. No DB access. onBatch gets each batch's test cases, with progress
// counted in requirements ("5/12"), as soon as they're generated.
export async function generateTestsForRequirements(
  requirements: Requirement[],
  options: {
    onBatch?: (batch: TestCase[], progress: BatchProgress) => Promise<void>;
  } = {},
): Promise<{ testCases: TestCase[]; usage: Usage }> {
  let usage = emptyUsage();
  const testCases: TestCase[] = [];
  let processedRequirements = 0;

  for (const batch of chunkArray(requirements, REQUIREMENT_BATCH_SIZE)) {
    const { object, usage: batchUsage } = await generateStructured({
      schema: TestGenerationBatchResultSchema,
      system: GENERATE_TESTS_SYSTEM_PROMPT,
      prompt: buildTestGenerationPrompt(batch.map(effectiveText)),
    });
    usage = addUsage(usage, batchUsage);

    if (object.results.length !== batch.length) {
      throw new AgentOutputError(
        `Test generation returned ${object.results.length} results for a batch of ${batch.length} requirements`,
      );
    }

    const batchTestCases = batch.flatMap((requirement, i) =>
      object.results[i].testCases.map((testCase) => ({
        ...testCase,
        requirementId: requirement.id,
        basedOnAssumption: requirement.isAmbiguous,
      })),
    );
    testCases.push(...batchTestCases);
    processedRequirements += batch.length;
    await options.onBatch?.(batchTestCases, {
      done: processedRequirements,
      total: requirements.length,
    });
  }

  return { testCases, usage };
}
