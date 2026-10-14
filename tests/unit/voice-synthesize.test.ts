import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  DEFAULT_MODEL_ID,
  DEFAULT_VOICE_ID,
  getVoiceConfig,
  isVoiceEnabled,
} from "@/lib/voice/config";
import { MAX_TTS_CHARS } from "@/lib/voice/schema";
import { synthesizeSpeech, VoiceDisabledError } from "@/lib/voice/synthesize";

// Replace the real SDK so no test ever calls ElevenLabs or needs a key.
const { convert, ElevenLabsClient } = vi.hoisted(() => {
  const convert = vi.fn();
  // A regular function (not an arrow) so it can be called with `new`.
  const ElevenLabsClient = vi.fn(function () {
    return { textToSpeech: { convert } };
  });
  return { convert, ElevenLabsClient };
});

vi.mock("@elevenlabs/elevenlabs-js", () => ({ ElevenLabsClient }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  convert.mockReset();
  ElevenLabsClient.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getVoiceConfig", () => {
  it("returns null and disables voice when the API key is missing", () => {
    expect(getVoiceConfig()).toBeNull();
    expect(isVoiceEnabled()).toBe(false);
  });

  it("treats an empty API key as missing", () => {
    process.env.ELEVENLABS_API_KEY = "";

    expect(isVoiceEnabled()).toBe(false);
  });

  it("falls back to the default voice and model", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";

    expect(getVoiceConfig()).toEqual({
      apiKey: "test-key",
      voiceId: DEFAULT_VOICE_ID,
      modelId: DEFAULT_MODEL_ID,
    });
  });

  it("reads voice and model overrides from the environment", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-123";
    process.env.ELEVENLABS_MODEL_ID = "model-456";

    expect(getVoiceConfig()).toMatchObject({
      voiceId: "voice-123",
      modelId: "model-456",
    });
  });
});

describe("synthesizeSpeech", () => {
  it("throws VoiceDisabledError without calling ElevenLabs when the key is missing", async () => {
    await expect(synthesizeSpeech("Hello")).rejects.toBeInstanceOf(
      VoiceDisabledError,
    );
    expect(ElevenLabsClient).not.toHaveBeenCalled();
  });

  it("sends the text, voice, and model to ElevenLabs and returns the stream", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    const stream = new ReadableStream<Uint8Array>();
    convert.mockResolvedValue(stream);

    const result = await synthesizeSpeech("  Hello there  ");

    expect(result).toBe(stream);
    expect(ElevenLabsClient).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(convert).toHaveBeenCalledWith(DEFAULT_VOICE_ID, {
      text: "Hello there",
      modelId: DEFAULT_MODEL_ID,
      outputFormat: "mp3_44100_128",
    });
  });

  it("accepts text exactly at the length limit", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    convert.mockResolvedValue(new ReadableStream());

    await synthesizeSpeech("a".repeat(MAX_TTS_CHARS));

    expect(convert).toHaveBeenCalledOnce();
  });

  it("rejects text over the length limit before spending any quota", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";

    await expect(
      synthesizeSpeech("a".repeat(MAX_TTS_CHARS + 1)),
    ).rejects.toBeInstanceOf(ZodError);
    expect(convert).not.toHaveBeenCalled();
  });

  it("rejects empty or whitespace-only text", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";

    await expect(synthesizeSpeech("   ")).rejects.toBeInstanceOf(ZodError);
    expect(convert).not.toHaveBeenCalled();
  });
});
