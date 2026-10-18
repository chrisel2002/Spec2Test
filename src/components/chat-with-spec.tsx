"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

import { useAccess } from "@/components/access-provider";
import { ListenButton } from "@/components/listen-button";
import { Button } from "@/components/ui/button";
import type { RetrievedChunk } from "@/lib/ai/retrieval";
import type { SpecUIMessage } from "@/lib/ai/chat-types";
import { MAX_TTS_CHARS } from "@/lib/voice/schema";
import { stripCitations } from "@/lib/voice/text";

function Citation({
  index,
  chunk,
  expanded,
  onToggle,
}: {
  index: number;
  chunk: RetrievedChunk;
  expanded: boolean;
  onToggle: () => void;
}) {
  const location = [chunk.heading, chunk.page ? `page ${chunk.page}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={onToggle}
        className="rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        [{index + 1}]
      </button>
      {expanded && (
        <div className="mt-1 max-w-md rounded border bg-muted/50 p-2 text-xs">
          {location && (
            <p className="mb-1 font-medium text-muted-foreground">
              {location}
            </p>
          )}
          <p className="whitespace-pre-wrap">{chunk.content}</p>
        </div>
      )}
    </div>
  );
}

export function ChatWithSpec({ voiceEnabled }: { voiceEnabled: boolean }) {
  const { messages, sendMessage, status } = useChat<SpecUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const { guard } = useAccess();

  // Only finished assistant answers: reading a half-streamed answer would
  // cut off mid-sentence and cache a truncated clip. Answers over the TTS
  // length cap get no button rather than a request the server would reject.
  function canListen(role: string, text: string, isLast: boolean) {
    if (!voiceEnabled || role !== "assistant") return false;
    const streaming = isLast && (status === "streaming" || status === "submitted");
    const spoken = stripCitations(text);
    return !streaming && spoken.length > 0 && spoken.length <= MAX_TTS_CHARS;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !guard()) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask a question about an uploaded spec. Answers are grounded in
            the retrieved excerpts and cite their source.
          </p>
        )}
        {messages.map((message, index) => {
          const citations =
            message.parts.find((p) => p.type === "data-citations")?.data ??
            [];
          const text = message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");

          return (
            <div key={message.id} className="text-sm">
              <div className="mb-1 flex items-center gap-1">
                <p className="font-medium">
                  {message.role === "user" ? "You" : "Assistant"}
                </p>
                {canListen(message.role, text, index === messages.length - 1) && (
                  <ListenButton getText={() => stripCitations(text)} />
                )}
              </div>
              <p className="whitespace-pre-wrap">{text}</p>
              {citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {citations.map((chunk, i) => {
                    const key = `${message.id}-${i}`;
                    return (
                      <Citation
                        key={key}
                        index={i}
                        chunk={chunk}
                        expanded={openCitation === key}
                        onToggle={() =>
                          setOpenCitation(openCitation === key ? null : key)
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the uploaded spec…"
          className="flex-1 rounded border px-3 py-2 text-sm"
          disabled={status === "streaming" || status === "submitted"}
        />
        <Button
          type="submit"
          disabled={status === "streaming" || status === "submitted"}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
