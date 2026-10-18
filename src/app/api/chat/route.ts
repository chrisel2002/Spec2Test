import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { NextResponse } from "next/server";

import { publicErrorMessage } from "@/lib/agents/errors";
import { getChatModel } from "@/lib/ai/providers";
import {
  buildExcerptContext,
  CHAT_WITH_SPEC_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/chat-with-spec";
import { retrieveRelevantChunks } from "@/lib/ai/retrieval";
import type { SpecUIMessage } from "@/lib/ai/chat-types";
import { requireAccess } from "@/lib/services/access";
import { rateLimit } from "@/lib/services/rate-limits";

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
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, "chat");
  if (limited) return limited;
  const { messages }: { messages: SpecUIMessage[] } = await request.json();

  const question = latestUserText(messages);
  let chunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = [];
  try {
    chunks = question ? await retrieveRelevantChunks(question, { topK: 5 }) : [];
  } catch (error) {
    console.error("Chat retrieval failed", error);
    return NextResponse.json({ error: publicErrorMessage(error) }, { status: 502 });
  }

  const stream = createUIMessageStream<SpecUIMessage>({
    // Without this the SDK sends a bare "An error occurred."; with it, the
    // user gets a safe summary and the server log keeps the details.
    onError: (error) => {
      console.error("Chat answer failed", error);
      return publicErrorMessage(error);
    },
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
