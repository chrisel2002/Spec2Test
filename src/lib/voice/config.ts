import "server-only";

// "George", one of ElevenLabs' default premade voices, available on every
// account (including the free tier).
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_MODEL_ID = "eleven_v4";

export type VoiceConfig = {
  apiKey: string;
  voiceId: string;
  modelId: string;
};

// Unlike requireEnv(), a missing key is not an error here: voice is an
// optional feature, so it returns null and callers switch voice off instead
// of crashing the app (or CI, which runs without an ElevenLabs key).
export function getVoiceConfig(): VoiceConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
  };
}

export function isVoiceEnabled(): boolean {
  return getVoiceConfig() !== null;
}
