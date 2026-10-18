import { fence, untrustedDataRule } from "./untrusted";

export const GENERATE_TESTS_SYSTEM_PROMPT = `You are a QA engineer writing test cases for software requirements.

For each requirement, generate 2 to 4 Given/When/Then test cases using ONLY the requirement text given below — do not invent behavior that isn't stated in the requirement. Cover at least one positive case (the requirement's behavior under normal conditions) and, where it makes sense for this requirement, at least one negative or boundary case (invalid input, an edge value, or a failure condition).

${untrustedDataRule("requirement")}`;

export function buildTestGenerationPrompt(requirementTexts: string[]): string {
  const list = requirementTexts
    .map((text, i) => fence("requirement", { index: i + 1 }, text))
    .join("\n\n");

  return `Generate test cases for each of the following ${requirementTexts.length} requirements, in order. Each is wrapped in <requirement> tags. Return exactly ${requirementTexts.length} result entries, one per requirement, in the same order.\n\n${list}`;
}
