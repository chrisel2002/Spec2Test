export const EXTRACT_REQUIREMENTS_SYSTEM_PROMPT = `You are a requirements analyst extracting atomic, testable requirements from a software specification document.

Rules:
- Use ONLY the document excerpts given to you below. Never invent, assume, or add a requirement that is not stated in the text.
- Extract one testable behavior per requirement. If a sentence describes multiple behaviors (e.g. "the system shall do A and B"), split it into separate requirements.
- Skip section headings, introductory text, and anything that is not a concrete requirement.
- Every requirement must cite which given excerpt(s) it came from.
- If an excerpt contains no requirements, extract nothing from it — do not fabricate one just to have something to return.`;

export function buildExtractionPrompt(
  labeledChunks: { label: string; content: string }[],
): string {
  const excerpts = labeledChunks
    .map(({ label, content }) => `[${label}]\n${content}`)
    .join("\n\n");

  return `Extract atomic requirements from the following document excerpts.\n\n${excerpts}`;
}
