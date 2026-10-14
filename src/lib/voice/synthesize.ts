import "server-only";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { getVoiceConfig } from "./config";
import { ttsRequestSchema } from "./schema";

export class VoiceDisabledError extends Error {
  constructor() {
    super("Voice output is disabled: ELEVENLABS_API_KEY is not set");
    this.name = "VoiceDisabledError";
  }
}

// Returns MP3 audio as a stream of bytes, so a route handler can pipe it
// straight into its response without holding the whole file in memory.
export async function synthesizeSpeech(
  text: string,
): Promise<ReadableStream<Uint8Array>> {
  const config = getVoiceConfig();
  if (!config) throw new VoiceDisabledError();

  // Validated here as well as in the route: this function is the one place
  // that spends quota, so it enforces the length cap for every caller.
  const request = ttsRequestSchema.parse({ text });

  const client = new ElevenLabsClient({ apiKey: config.apiKey });
  return client.textToSpeech.convert(config.voiceId, {
    text: request.text,
    modelId: config.modelId,
    outputFormat: "mp3_44100_128",
  });
}
