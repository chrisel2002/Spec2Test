// Standalone smoke test for the ElevenLabs API: converts one sentence to
// speech and writes it to output/hello.mp3. Run with `pnpm tts:hello`
// (which loads ELEVENLABS_API_KEY from .env.local).
import { mkdir, writeFile } from "node:fs/promises";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// "George", one of ElevenLabs' default premade voices.
const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_v4";

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set (expected in .env.local)");
  }

  const client = new ElevenLabsClient({ apiKey });
  const stream = await client.textToSpeech.convert(VOICE_ID, {
    text: "Hello from Spec2Test. Your requirements are ready for review.",
    modelId: MODEL_ID,
    outputFormat: "mp3_44100_128",
  });

  // The SDK returns a web ReadableStream; Response is the simplest way to
  // collect it into a single buffer without hand-writing a reader loop.
  const audio = Buffer.from(await new Response(stream).arrayBuffer());

  await mkdir("output", { recursive: true });
  await writeFile("output/hello.mp3", audio);
  console.log(`Wrote output/hello.mp3 (${audio.length} bytes)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
