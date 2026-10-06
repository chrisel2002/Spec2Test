import {
  buildExtractionPrompt,
  EXTRACT_REQUIREMENTS_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/extract-requirements";
import { generateStructured } from "@/lib/ai/generate-structured";

import { chunkArray } from "../batch";
import { ExtractionBatchResultSchema, type Requirement } from "../schemas";
import { addUsage, emptyUsage, type Usage } from "../usage";

const CHUNK_BATCH_SIZE = 5;

export type SourceChunk = { id: string; content: string };

// Pure logic: batches chunks, calls the model, resolves each requirement's
// chunk-label citations back to real chunk IDs, and assigns sequential
// REQ-NN codes. No DB access, so this is directly unit-testable with only
// the model call mocked.
export async function extractRequirementsFromChunks(
  chunks: SourceChunk[],
): Promise<{ requirements: Requirement[]; usage: Usage }> {
  let usage = emptyUsage();
  const extracted: { title: string; text: string; sourceChunkIds: string[] }[] =
    [];

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

    for (const req of object.requirements) {
      const sourceChunkIds = req.sourceChunkRefs
        .map((ref) => labelToId.get(ref))
        .filter((id): id is string => id !== undefined);

      // The model cited a label we never gave it — drop rather than store
      // a requirement we can't actually trace back to source text.
      if (sourceChunkIds.length === 0) continue;

      extracted.push({ title: req.title, text: req.text, sourceChunkIds });
    }
  }

  const requirements: Requirement[] = extracted.map((req, i) => ({
    id: `REQ-${String(i + 1).padStart(2, "0")}`,
    title: req.title,
    text: req.text,
    sourceChunkIds: req.sourceChunkIds,
    isAmbiguous: false,
    ambiguityReason: null,
    suggestedRewrite: null,
  }));

  return { requirements, usage };
}
