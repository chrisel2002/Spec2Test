import {
  buildAmbiguityPrompt,
  CHECK_AMBIGUITY_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/check-ambiguity";
import { generateStructured } from "@/lib/ai/generate-structured";

import { type BatchProgress, chunkArray } from "../batch";
import { AgentOutputError } from "../errors";
import { AmbiguityBatchResultSchema, type Requirement } from "../schemas";
import { addUsage, emptyUsage, type Usage } from "../usage";

const AMBIGUITY_BATCH_SIZE = 5;

// Pure logic: batches requirements, asks the model to judge testability for
// each, and returns the requirements with isAmbiguous/ambiguityReason/
// suggestedRewrite filled in. No DB access. onBatch gets each judged batch
// as soon as it's ready.
export async function checkAmbiguityForRequirements(
  requirements: Requirement[],
  options: {
    onBatch?: (batch: Requirement[], progress: BatchProgress) => Promise<void>;
  } = {},
): Promise<{ requirements: Requirement[]; usage: Usage }> {
  let usage = emptyUsage();
  const updated: Requirement[] = [];

  for (const batch of chunkArray(requirements, AMBIGUITY_BATCH_SIZE)) {
    const { object, usage: batchUsage } = await generateStructured({
      schema: AmbiguityBatchResultSchema,
      system: CHECK_AMBIGUITY_SYSTEM_PROMPT,
      prompt: buildAmbiguityPrompt(batch.map((r) => r.text)),
    });
    usage = addUsage(usage, batchUsage);

    if (object.results.length !== batch.length) {
      throw new AgentOutputError(
        `Ambiguity check returned ${object.results.length} results for a batch of ${batch.length} requirements`,
      );
    }

    const judged = batch.map((requirement, i) => {
      const result = object.results[i];
      return {
        ...requirement,
        isAmbiguous: result.isAmbiguous,
        ambiguityReason: result.reason,
        suggestedRewrite: result.suggestedRewrite,
      };
    });
    updated.push(...judged);
    await options.onBatch?.(judged, {
      done: updated.length,
      total: requirements.length,
    });
  }

  return { requirements: updated, usage };
}
