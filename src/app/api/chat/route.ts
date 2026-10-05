import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";

import { getChatModel } from "@/lib/ai/providers";
import {
  buildExcerptContext,
  CHAT_WITH_SPEC_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/chat-with-spec";
import { retrieveRelevantChunks } from "@/lib/ai/retrieval";
import type { SpecUIMessage } from "@/lib/ai/chat-types";

export const dynamic = "force-dynamic";

function latestUserText(messages: SpecUIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (
    lastUser?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ") ?? ""
  );
}

export async function POST(request: Request) {
  const { messages }: { messages: SpecUIMessage[] } = await request.json();

  const question = latestUserText(messages);
  const chunks = question
    ? await retrieveRelevantChunks(question, { topK: 5 })
    : [];

  const stream = createUIMessageStream<SpecUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "data-citations", data: chunks });

      const result = streamText({
        model: getChatModel(),
        system: `${CHAT_WITH_SPEC_SYSTEM_PROMPT}\n\n${buildExcerptContext(chunks)}`,
        messages: await convertToModelMessages(messages),
      });

      writer.merge(toUIMessageStream({ stream: result.fullStream }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
