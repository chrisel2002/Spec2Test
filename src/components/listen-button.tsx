"use client";

import { Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAccess } from "@/components/access-provider";
import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "playing";

// Fetches MP3 audio from /api/voice and plays it. getText is a function
// rather than a string so callers can fetch the text lazily (the run
// summary is only requested when the user actually clicks).
export function ListenButton({
  getText,
  label,
}: {
  getText: () => string | Promise<string>;
  label?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { guard } = useAccess();

  function releaseAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      URL.revokeObjectURL(audio.src);
      audioRef.current = null;
    }
  }

  function stop() {
    releaseAudio();
    setStatus("idle");
  }

  // Stop playback if the button unmounts (e.g. switching documents).
  useEffect(() => releaseAudio, []);

  async function play() {
    if (!guard()) return;
    setStatus("loading");
    setError(null);

    try {
      const text = await getText();
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("Couldn't generate audio");

      const audio = new Audio(URL.createObjectURL(await response.blob()));
      audio.onended = stop;
      audioRef.current = audio;
      await audio.play();
      setStatus("playing");
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : "Playback failed");
    }
  }

  const title = status === "playing" ? "Stop" : (label ?? "Read aloud");

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size={label ? "sm" : "icon-sm"}
        onClick={status === "playing" ? stop : play}
        disabled={status === "loading"}
        aria-label={title}
        title={title}
      >
        {status === "loading" ? (
          <Loader2 className="animate-spin" />
        ) : status === "playing" ? (
          <Square />
        ) : (
          <Volume2 />
        )}
        {label && <span>{status === "playing" ? "Stop" : label}</span>}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
