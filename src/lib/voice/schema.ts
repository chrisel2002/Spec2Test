import { z } from "zod";

// ElevenLabs bills per character, and the free tier has a small monthly
// allowance, so cap a single request. 1,000 characters comfortably fits a
// chat answer or run summary (roughly a minute of speech).
export const MAX_TTS_CHARS = 1000;

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
});

export type TtsRequest = z.infer<typeof ttsRequestSchema>;
