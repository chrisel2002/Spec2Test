import { checkAmbiguityForRequirements } from "@/lib/agents/nodes/check-ambiguity";
import { extractRequirementsFromChunks } from "@/lib/agents/nodes/extract-requirements";
import { generateTestsForRequirements } from "@/lib/agents/nodes/generate-tests";
import { addUsage } from "@/lib/agents/usage";
import { observeStructuredCalls, type StructuredCallEvent } from "@/lib/ai/generate-structured";
import { chunkDocument } from "@/lib/ingest/chunk";
import { parseMarkdown } from "@/lib/ingest/markdown";

import type { SpecOutput } from "./metrics";

// Runs the agent on one spec the same way a real run does, minus the
// database: parse and chunk the Markdown, then call the three node
// functions the LangGraph nodes call (extract -> check ambiguity ->
// generate tests). No embeddings are needed: extraction reads chunk text,
// not vectors. That keeps the eval runnable anywhere, CI included.
export async function runPipeline(markdown: string): Promise<SpecOutput> {
  const chunks = chunkDocument(parseMarkdown(markdown)).map((chunk, index) => ({
    id: `chunk-${index}`,
    content: chunk.content,
  }));

  const calls: StructuredCallEvent[] = [];
  const unsubscribe = observeStructuredCalls((event) => calls.push(event));
  const started = Date.now();

  try {
    const time = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
      const stepStarted = Date.now();
      return [await fn(), Date.now() - stepStarted];
    };

    const [extraction, extractMs] = await time(() => extractRequirementsFromChunks(chunks));
    const [ambiguity, ambiguityMs] = await time(() =>
      checkAmbiguityForRequirements(extraction.requirements),
    );
    const [tests, testsMs] = await time(() =>
      generateTestsForRequirements(ambiguity.requirements),
    );

    return {
      requirements: ambiguity.requirements.map((r) => ({
        code: r.id,
        title: r.title,
        text: r.text,
        isAmbiguous: r.isAmbiguous,
        sourceChunkIds: r.sourceChunkIds,
      })),
      testCases: tests.testCases.map((tc) => ({
        requirementCode: tc.requirementId,
        title: tc.title,
        given: tc.given,
        when: tc.when,
        then: tc.then,
      })),
      ungroundedCount: extraction.ungroundedCount,
      calls,
      usage: addUsage(addUsage(extraction.usage, ambiguity.usage), tests.usage),
      durationMs: Date.now() - started,
      stepDurationsMs: { extract: extractMs, ambiguity: ambiguityMs, tests: testsMs },
    };
  } finally {
    unsubscribe();
  }
}
