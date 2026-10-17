import { CHECK_AMBIGUITY_SYSTEM_PROMPT } from "./prompts/check-ambiguity";
import { EXTRACT_REQUIREMENTS_SYSTEM_PROMPT } from "./prompts/extract-requirements";
import { GENERATE_TESTS_SYSTEM_PROMPT } from "./prompts/generate-tests";

// A deterministic stand-in for the model, selected with MODEL_PROVIDER=mock.
// It reads the same prompts the real model gets and returns plausible
// structured output derived from them, so e2e tests and offline demos run
// the real pipeline (batching, Zod validation, DB writes, streaming) with
// no API key and the same result every time.
//
// It's a rule-based imitation, not a model: requirements are "sentences
// with shall/must/should", ambiguity is "contains a vague word". Good
// enough to exercise every code path; useless for judging quality.

const VAGUE_TERMS: Record<string, string> = {
  fast: "a response within 2 seconds for 95% of requests",
  responsive: "a response within 2 seconds for 95% of requests",
  quickly: "completion within 2 seconds for 95% of requests",
  "user-friendly": "a first-time user completing the task unaided in under 1 minute",
  intuitive: "a first-time user completing the task unaided in under 1 minute",
  easy: "a first-time user completing the task unaided in under 1 minute",
  reasonable: "an explicit numeric limit stated in the requirement",
  appropriate: "an explicit, listed set of allowed values",
  secure: "compliance with the OWASP ASVS level 2 controls",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstWords(text: string, count: number): string {
  const words = text.replace(/[.:;]$/, "").split(/\s+/);
  return words.length > count
    ? `${words.slice(0, count).join(" ")}…`
    : words.join(" ");
}

// "1. text\n\n2. text" -> ["text", "text"], after the instruction line.
export function parseNumberedList(prompt: string): string[] {
  const body = prompt.slice(prompt.indexOf("\n\n") + 2);
  return body
    .split(/\n\n(?=\d+\. )/)
    .map((item) => item.replace(/^\d+\. /, "").trim())
    .filter(Boolean);
}

// "[chunk_1]\ncontent\n\n[chunk_2]\ncontent" -> labelled chunks.
export function parseLabeledChunks(
  prompt: string,
): { label: string; content: string }[] {
  const parts = prompt.split(/^\[(chunk_\d+)\]\n/m);
  const chunks: { label: string; content: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    chunks.push({ label: parts[i], content: parts[i + 1].trim() });
  }
  return chunks;
}

function mockExtraction(prompt: string) {
  const requirements = parseLabeledChunks(prompt).flatMap(({ label, content }) => {
    const lines = content.split("\n");
    const heading = lines.find((line) => line.startsWith("#"));
    const text = lines
      .filter((line) => !line.startsWith("#"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const sentences = text
      .split(/(?<=\.)\s+/)
      .filter((sentence) => /\b(shall|must|should)\b/i.test(sentence));
    const headingTitle = heading
      ?.replace(/^#+\s*/, "")
      .replace(/^(REQ-)?[\d.]+:?\s*/, "");

    // One requirement per obligation sentence; a section with a single one
    // keeps its heading as the title.
    return sentences.map((sentence) => ({
      title:
        sentences.length === 1 && headingTitle
          ? headingTitle
          : firstWords(
              sentence.replace(/^The system (shall|must|should) /i, ""),
              6,
            ),
      text: sentence,
      sourceChunkRefs: [label],
    }));
  });
  return { requirements };
}

function mockAmbiguity(prompt: string) {
  const results = parseNumberedList(prompt).map((text) => {
    const term = Object.keys(VAGUE_TERMS).find((t) =>
      new RegExp(`\\b${t}\\b`, "i").test(text),
    );
    if (!term) {
      return { isAmbiguous: false, reason: null, suggestedRewrite: null };
    }
    return {
      isAmbiguous: true,
      reason: `Uses "${term}" without a measurable threshold, so there is no pass/fail criterion.`,
      suggestedRewrite: `${text.replace(/\.$/, "")}, measured as ${VAGUE_TERMS[term]}.`,
    };
  });
  return { results };
}

function mockTests(prompt: string) {
  const results = parseNumberedList(prompt).map((text) => ({
    testCases: [
      {
        title: `Accepts: ${firstWords(text, 7)}`,
        type: "positive" as const,
        given: "the system is running with a registered user and valid test data",
        when: "the user performs the action the requirement describes with valid input",
        then: text,
      },
      {
        title: `Rejects invalid input: ${firstWords(text, 5)}`,
        type: "negative" as const,
        given: "the system is running with a registered user",
        when: "the same action is attempted with missing or invalid input",
        then: "the action is refused with a clear error message and no data is changed",
      },
    ],
  }));
  return { results };
}

export async function mockStructuredObject(
  system: string,
  prompt: string,
): Promise<{
  object: unknown;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  // A short pause per call so progress is visible when demoing the UI.
  await sleep(Number(process.env.MOCK_MODEL_DELAY_MS ?? 500));

  let object: unknown;
  if (system === EXTRACT_REQUIREMENTS_SYSTEM_PROMPT) {
    object = mockExtraction(prompt);
  } else if (system === CHECK_AMBIGUITY_SYSTEM_PROMPT) {
    object = mockAmbiguity(prompt);
  } else if (system === GENERATE_TESTS_SYSTEM_PROMPT) {
    object = mockTests(prompt);
  } else {
    throw new Error("The mock model has no response for this prompt");
  }

  // Roughly 4 characters per token, so cost estimates aren't all zero.
  const inputTokens = Math.ceil((system.length + prompt.length) / 4);
  const outputTokens = Math.ceil(JSON.stringify(object).length / 4);
  return {
    object,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}
