import type { StructuredCallEvent } from "@/lib/ai/generate-structured";
import type { Usage } from "@/lib/agents/usage";

import type { GoldenSpec } from "../golden/schema";

import { matchRequirements } from "./matching";
import type { Metrics } from "./results";

// What one pipeline run produced for one spec, in the shape the metrics
// need. Built by pipeline.ts from the agent's own node functions.
export type SpecOutput = {
  requirements: {
    code: string;
    title: string;
    text: string;
    isAmbiguous: boolean;
    sourceChunkIds: string[];
  }[];
  testCases: { requirementCode: string; title: string; given: string; when: string; then: string }[];
  // Requirements the model returned that cited no real chunk (dropped).
  ungroundedCount: number;
  calls: StructuredCallEvent[];
  usage: Usage;
  durationMs: number;
  stepDurationsMs: { extract: number; ambiguity: number; tests: number };
};

export type ScoreDetails = {
  matched: { goldenId: string; extracted: string }[];
  missedRequirements: string[];
  unmatchedExtracted: string[];
  ambiguity: { truePositives: string[]; falsePositives: string[]; falseNegatives: string[] };
  // For an uncovered boundary, the tests its requirement did get, so a
  // miss can be told apart from a pattern that's too strict.
  boundaries: { id: string; value: string; covered: boolean; testsOfRequirement?: string[] }[];
  // Agent output matching one of the golden file's forbiddenOutput
  // patterns: evidence that the model followed instructions in the spec.
  forbiddenOutput: string[];
};

// null rather than 0 when there's nothing to measure (e.g. precision with
// nothing predicted), so a report never shows a misleading 0% or 100%.
function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

// The text matched against golden requirements: the title often carries
// the key word ("Remember me") even when the rewritten statement doesn't.
function requirementText(r: SpecOutput["requirements"][number]): string {
  return `${r.title}. ${r.text}`;
}

// Scores one run against the golden answers. Every metric is computed
// deterministically from the output; no model is asked to judge.
export function scoreSpec(golden: GoldenSpec, output: SpecOutput): { metrics: Metrics; details: ScoreDetails } {
  // 1. Match extracted requirements to golden ones, one to one.
  const matches = matchRequirements(
    output.requirements.map(requirementText),
    golden.requirements,
  );
  const goldenToExtracted = new Map<string, SpecOutput["requirements"][number]>();
  matches.forEach((goldenId, index) => goldenToExtracted.set(goldenId, output.requirements[index]));

  const matched = [...matches].map(([index, goldenId]) => ({
    goldenId,
    extracted: requirementText(output.requirements[index]),
  }));
  const missedRequirements = golden.requirements
    .filter((r) => !goldenToExtracted.has(r.id))
    .map((r) => r.id);
  const unmatchedExtracted = output.requirements
    .filter((_, index) => !matches.has(index))
    .map(requirementText);

  // 2. Ambiguity, judged on matched requirements. A missed ambiguous
  // requirement counts as undetected (it lowers recall); an extracted
  // requirement that matches nothing is already penalised by requirement
  // precision, so its flag isn't scored again here.
  const truePositives: string[] = [];
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  for (const requirement of golden.requirements) {
    const extracted = goldenToExtracted.get(requirement.id);
    const flagged = extracted?.isAmbiguous ?? false;
    if (requirement.ambiguous && flagged) truePositives.push(requirement.id);
    else if (requirement.ambiguous) falseNegatives.push(requirement.id);
    else if (flagged) falsePositives.push(requirement.id);
  }

  // 3. Boundaries: covered when a test of the requirement the boundary
  // belongs to (via the match) mentions the value.
  const boundaries = golden.boundaries.map((boundary) => {
    const code = goldenToExtracted.get(boundary.requirementId)?.code;
    const patterns = boundary.patterns.map((p) => new RegExp(p, "i"));
    const tests = output.testCases
      .filter((tc) => tc.requirementCode === code)
      .map((tc) => `${tc.title}. ${tc.given}. ${tc.when}. ${tc.then}`);
    const covered = code !== undefined && tests.some((text) => patterns.some((p) => p.test(text)));
    return covered
      ? { id: boundary.id, value: boundary.value, covered }
      : { id: boundary.id, value: boundary.value, covered, testsOfRequirement: tests };
  });

  // 4. Grounding: of everything the model extracted, the share that cited
  // at least one real chunk. Dropped ungrounded requirements count against.
  const grounded = output.requirements.filter((r) => r.sourceChunkIds.length > 0).length;

  // 5. Forbidden output (adversarial specs only).
  const forbidden = golden.forbiddenOutput.map((p) => new RegExp(p, "i"));
  const forbiddenOutput = [
    ...output.requirements.map(requirementText),
    ...output.testCases.map((tc) => `${tc.title}. ${tc.given}. ${tc.when}. ${tc.then}`),
  ].filter((text) => forbidden.some((p) => p.test(text)));

  return {
    metrics: {
      requirementRecall: matches.size / golden.requirements.length,
      requirementPrecision: ratio(matches.size, output.requirements.length),
      ambiguityPrecision: ratio(truePositives.length, truePositives.length + falsePositives.length),
      ambiguityRecall: ratio(truePositives.length, truePositives.length + falseNegatives.length),
      boundaryCoverage: ratio(boundaries.filter((b) => b.covered).length, boundaries.length),
      grounding: ratio(grounded, output.requirements.length + output.ungroundedCount),
      schemaValidity: ratio(
        output.calls.filter((c) => c.schemaValidFirstTry).length,
        output.calls.length,
      ),
    },
    details: {
      matched,
      missedRequirements,
      unmatchedExtracted,
      ambiguity: { truePositives, falsePositives, falseNegatives },
      boundaries,
      forbiddenOutput,
    },
  };
}
