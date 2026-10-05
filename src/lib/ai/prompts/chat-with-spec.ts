import type { RetrievedChunk } from "@/lib/ai/retrieval";

// Keeping prompts out of route handlers/components means changing the
// model's behavior never requires touching request-handling code.
export const CHAT_WITH_SPEC_SYSTEM_PROMPT = `You are a requirements-spec assistant. Answer the user's question using ONLY the numbered excerpts provided below, which were retrieved from the uploaded specification.

Rules:
- Cite every claim with the excerpt number it came from, like [1] or [2][3].
- If the excerpts don't contain enough information to answer, say so plainly instead of guessing. Never use outside knowledge.
- Keep answers concise.`;

export function buildExcerptContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No excerpts were retrieved — no uploaded spec covers this.";
  }

  return chunks
    .map((chunk, i) => {
      const location = [chunk.heading, chunk.page ? `page ${chunk.page}` : null]
        .filter(Boolean)
        .join(", ");

      return `[${i + 1}]${location ? ` (${location})` : ""}\n${chunk.content}`;
    })
    .join("\n\n");
}
