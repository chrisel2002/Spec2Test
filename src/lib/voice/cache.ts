import "server-only";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { audioCache } from "@/lib/db/schema";

import { getVoiceConfig } from "./config";
import { ttsRequestSchema } from "./schema";
import { synthesizeSpeech, VoiceDisabledError } from "./synthesize";

// Voice and model are part of the key because changing either produces
// different audio for the same text. JSON-encoding the tuple (rather than
// concatenating strings) keeps ("ab", "c") and ("a", "bc") distinct.
export function audioCacheKey(
  text: string,
  voiceId: string,
  modelId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([text, voiceId, modelId]))
    .digest("hex");
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export type SpeechResult = {
  audio: ReadableStream<Uint8Array>;
  cacheHit: boolean;
  // On a miss, resolves once the audio has been written to the cache. The
  // route hands it to Next's after() so the write finishes even though the
  // response has already started streaming.
  pendingCacheWrite: Promise<void> | null;
};

export async function getSpeech(text: string): Promise<SpeechResult> {
  const config = getVoiceConfig();
  if (!config) throw new VoiceDisabledError();

  // Hash the validated (trimmed) text so "Hi " and "Hi" share one entry.
  const request = ttsRequestSchema.parse({ text });
  const hash = audioCacheKey(request.text, config.voiceId, config.modelId);

  const [hit] = await db
    .select({ audio: audioCache.audio })
    .from(audioCache)
    .where(eq(audioCache.hash, hash))
    .limit(1);

  if (hit) {
    return {
      audio: streamFromBytes(hit.audio),
      cacheHit: true,
      pendingCacheWrite: null,
    };
  }

  // tee() splits the ElevenLabs stream in two: one branch goes to the
  // browser as it arrives, the other is collected and saved. Buffering it
  // all first and then responding would be simpler but would delay the
  // first byte until generation finished.
  const [forClient, forCache] = (await synthesizeSpeech(request.text)).tee();

  const pendingCacheWrite = new Response(forCache)
    .arrayBuffer()
    .then((buffer) =>
      db
        .insert(audioCache)
        .values({ hash, audio: Buffer.from(buffer) })
        .onConflictDoNothing(),
    )
    .then(() => undefined);

  return { audio: forClient, cacheHit: false, pendingCacheWrite };
}
