import {
  buildExtractionPrompt,
  EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/extract-requirements";
import { generateStructured } from "@/lib/ai/generate-structured";

import { type BatchProgress, chunkArray } from "../batch";
import { ExtractionBatchResultSchema, type Requirement } from "../schemas";
import { addUsage, emptyUsage, type Usage } from "../usage";

const CHUNK_BATCH_SIZE = 5;

export type SourceChunk = { id: string; content: string };

function toRequirement(
  number: number,
  extracted: { title: string; text: string; sourceChunkIds: string[] },
): Requirement {
  return {
    id: `REQ-${String(number).padStart(2, "0")}`,
    title: extracted.title,
    text: extracted.text,
    sourceChunkIds: extracted.sourceChunkIds,
    isAmbiguous: false,
    ambiguityReason: null,
    suggestedRewrite: null,
  };
}

// Pure logic: batches chunks, calls the model, resolves each requirement's
// chunk-label citations back to real chunk IDs, and assigns sequential
// REQ-NN codes. No DB access, so this is directly unit-testable with only
// the model call mocked. onBatch receives each batch's requirements as
// soon as they exist, so the caller can save and stream them while later
// batches are still being extracted.
export async function extractRequirementsFromChunks(
  chunks: SourceChunk[],
  options: {
    onBatch?: (batch: Requirement[], progress: BatchProgress) => Promise<void>;
  } = {},
): Promise<{ requirements: Requirement[]; usage: Usage; ungroundedCount: number }> {
  let usage = emptyUsage();
  const requirements: Requirement[] = [];
  // Requirements the model returned with only made-up chunk labels. Dropped,
  // but counted, so the eval can report how often the model fails to cite.
  let ungroundedCount = 0;
  let processedChunks = 0;

  for (const batch of chunkArray(chunks, CHUNK_BATCH_SIZE)) {
    const labeled = batch.map((chunk, i) => ({
      label: `chunk_${i + 1}`,
      chunk,
    }));
    const labelToId = new Map(
      labeled.map(({ label, chunk }) => [label, chunk.id]),
    );

    const { object, usage: batchUsage } = await generateStructured({
      schema: ExtractionBatchResultSchema,
      system: EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
      prompt: buildExtractionPrompt(
        labeled.map(({ label, chunk }) => ({ label, content: chunk.content })),
      ),
    });
    usage = addUsage(usage, batchUsage);

    const batchRequirements: Requirement[] = [];
    for (const req of object.requirements) {
      const sourceChunkIds = req.sourceChunkRefs
        .map((ref) => labelToId.get(ref))
        .filter((id): id is string => id !== undefined);

      // The model cited a label we never gave it — drop rather than store
      // a requirement we can't actually trace back to source text.
      if (sourceChunkIds.length === 0) {
        ungroundedCount += 1;
        continue;
      }

      // Numbered across batches, not per batch, so codes stay gap-free.
      batchRequirements.push(
        toRequirement(requirements.length + batchRequirements.length + 1, {
          title: req.title,
          text: req.text,
          sourceChunkIds,
        }),
      );
    }

    requirements.push(...batchRequirements);
    processedChunks += batch.length;
    await options.onBatch?.(batchRequirements, {
      done: processedChunks,
      total: chunks.length,
    });
  }

  return { requirements, usage, ungroundedCount };
}
