import { NextResponse } from "next/server";

import { isVoiceEnabled } from "@/lib/voice/config";
import { ttsRequestSchema } from "@/lib/voice/schema";
import { synthesizeSpeech } from "@/lib/voice/synthesize";

export const dynamic = "force-dynamic";

// Text in, MP3 out. The browser only ever talks to this route; the
// ElevenLabs key stays in server memory and is never sent to the client.
export async function POST(request: Request) {
  if (!isVoiceEnabled()) {
    return NextResponse.json(
      { error: "Voice output is not configured" },
      { status: 503 },
    );
  }

  const parsed = ttsRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const audio = await synthesizeSpeech(parsed.data.text);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("Text-to-speech failed", error);
    return NextResponse.json(
      { error: "Text-to-speech failed" },
      { status: 502 },
    );
  }
}
