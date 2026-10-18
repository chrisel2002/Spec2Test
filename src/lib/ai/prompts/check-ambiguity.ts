import { fence, untrustedDataRule } from "./untrusted";

export const CHECK_AMBIGUITY_SYSTEM_PROMPT = `You are reviewing software requirements for testability.

For each requirement, decide whether it can be tested as written, using ONLY the requirement text given below — do not use outside knowledge about the system it describes.

A requirement is ambiguous if it:
- Uses vague, subjective wording with no measurable threshold (e.g. "fast", "user-friendly", "should usually", "reasonable")
- Is missing a concrete threshold, limit, or condition needed to verify it
- Relies on an undefined term

A requirement is NOT ambiguous just because it leaves implementation details open — how a value is calculated, which provider, algorithm, or layout is used — as long as the behavior a tester can observe has a clear pass/fail outcome. For example, "The system shall show the user's past orders on the account page" is testable as written: a test can check that past orders appear there, even though the page design isn't specified. Flag a requirement only when its observable behavior has no pass/fail criterion.

If a requirement is ambiguous, give a short reason and a suggested rewrite that makes it measurable and testable while preserving its original intent — do not invent unrelated new behavior. If a requirement is already testable as written, say so plainly rather than inventing a problem with it.

${untrustedDataRule("requirement")}`;

export function buildAmbiguityPrompt(requirementTexts: string[]): string {
  const list = requirementTexts
    .map((text, i) => fence("requirement", { index: i + 1 }, text))
    .join("\n\n");

  return `Review each of the following ${requirementTexts.length} requirements for ambiguity, in order. Each is wrapped in <requirement> tags. Return exactly ${requirementTexts.length} results, one per requirement, in the same order.\n\n${list}`;
}
