import { after, NextResponse } from "next/server";

import { getSpeech } from "@/lib/voice/cache";
import { isVoiceEnabled } from "@/lib/voice/config";
import { ttsRequestSchema } from "@/lib/voice/schema";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

// Text in, MP3 out. The browser only ever talks to this route; the
// ElevenLabs key stays in server memory and is never sent to the client.
export async function POST(request: Request) {
  const limited = rateLimit(request, "voice");
  if (limited) return limited;
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
    const { audio, cacheHit, pendingCacheWrite } = await getSpeech(
      parsed.data.text,
    );

    if (pendingCacheWrite) {
      // A failed cache write shouldn't fail the request: the user already
      // has their audio, it just won't be cached for next time.
      after(() =>
        pendingCacheWrite.catch((error: unknown) =>
          console.error("Failed to cache audio", error),
        ),
      );
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Audio-Cache": cacheHit ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    console.error("Text-to-speech failed", error);
    return NextResponse.json(
      { error: "Text-to-speech failed" },
      { status: 502 },
    );
  }
}
