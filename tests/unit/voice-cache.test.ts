import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audioCacheKey, getSpeech } from "@/lib/voice/cache";
import { DEFAULT_MODEL_ID, DEFAULT_VOICE_ID } from "@/lib/voice/config";
import { VoiceDisabledError } from "@/lib/voice/synthesize";

const { convert, fakeDb } = vi.hoisted(() => ({
  convert: vi.fn(),
  // Just enough of Drizzle's query-builder chain for getSpeech().
  fakeDb: {
    rows: [] as { audio: Buffer }[],
    inserted: [] as { hash: string; audio: Buffer }[],
  },
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: vi.fn(function () {
    return { textToSpeech: { convert } };
  }),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => fakeDb.rows }),
      }),
    }),
    insert: () => ({
      values: (row: { hash: string; audio: Buffer }) => {
        fakeDb.inserted.push(row);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  },
}));

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ELEVENLABS_API_KEY: "test-key" };
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  convert.mockReset();
  fakeDb.rows = [];
  fakeDb.inserted = [];
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("audioCacheKey", () => {
  it("is stable for the same inputs", () => {
    expect(audioCacheKey("hi", "v", "m")).toBe(audioCacheKey("hi", "v", "m"));
  });

  it("changes when the text, voice, or model changes", () => {
    const base = audioCacheKey("hi", "v", "m");

    expect(audioCacheKey("bye", "v", "m")).not.toBe(base);
    expect(audioCacheKey("hi", "v2", "m")).not.toBe(base);
    expect(audioCacheKey("hi", "v", "m2")).not.toBe(base);
  });

  it("doesn't collide when field boundaries shift", () => {
    expect(audioCacheKey("ab", "c", "m")).not.toBe(
      audioCacheKey("a", "bc", "m"),
    );
  });
});

describe("getSpeech", () => {
  it("serves cached audio without calling ElevenLabs", async () => {
    fakeDb.rows = [{ audio: Buffer.from("cached-mp3") }];

    const result = await getSpeech("Hello");

    expect(result.cacheHit).toBe(true);
    expect(result.pendingCacheWrite).toBeNull();
    expect(await readAll(result.audio)).toBe("cached-mp3");
    expect(convert).not.toHaveBeenCalled();
  });

  it("on a miss, streams fresh audio and writes the same bytes to the cache", async () => {
    convert.mockResolvedValue(streamOf("fresh-mp3"));

    const result = await getSpeech("  Hello  ");

    expect(result.cacheHit).toBe(false);
    expect(await readAll(result.audio)).toBe("fresh-mp3");
    await result.pendingCacheWrite;
    expect(fakeDb.inserted).toHaveLength(1);
    expect(fakeDb.inserted[0]?.audio.toString()).toBe("fresh-mp3");
    // Keyed by the trimmed text, so "Hello" and "  Hello  " share an entry.
    expect(fakeDb.inserted[0]?.hash).toBe(
      audioCacheKey("Hello", DEFAULT_VOICE_ID, DEFAULT_MODEL_ID),
    );
  });

  it("throws VoiceDisabledError when the API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;

    await expect(getSpeech("Hello")).rejects.toBeInstanceOf(VoiceDisabledError);
    expect(convert).not.toHaveBeenCalled();
  });
});
