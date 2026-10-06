import { generateStructured } from "@/lib/ai/generate-structured";
import {
  buildTestGenerationPrompt,
  GENERATE_TESTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/generate-tests";

import { chunkArray } from "../batch";
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
// code. No DB access.
export async function generateTestsForRequirements(
  requirements: Requirement[],
): Promise<{ testCases: TestCase[]; usage: Usage }> {
  let usage = emptyUsage();
  const testCases: TestCase[] = [];

  for (const batch of chunkArray(requirements, REQUIREMENT_BATCH_SIZE)) {
    const { object, usage: batchUsage } = await generateStructured({
      schema: TestGenerationBatchResultSchema,
      system: GENERATE_TESTS_SYSTEM_PROMPT,
      prompt: buildTestGenerationPrompt(batch.map(effectiveText)),
    });
    usage = addUsage(usage, batchUsage);

    if (object.results.length !== batch.length) {
      throw new Error(
        `Test generation returned ${object.results.length} results for a batch of ${batch.length} requirements`,
      );
    }

    batch.forEach((requirement, i) => {
      for (const testCase of object.results[i].testCases) {
        testCases.push({
          ...testCase,
          requirementId: requirement.id,
          basedOnAssumption: requirement.isAmbiguous,
        });
      }
    });
  }

  return { testCases, usage };
}
