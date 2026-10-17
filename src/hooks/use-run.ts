"use client";

import { useEffect, useReducer, useState } from "react";

import { runReducer } from "@/lib/runs/reducer";
import { type RunDetail, type RunEvent, RunEventSchema } from "@/lib/runs/types";

export type ConnectionState = "idle" | "live" | "reconnecting";

function runStatusOf(event: RunEvent) {
  if (event.type === "run") return event.run.status;
  if (event.type === "snapshot") return event.detail.run.status;
  return null;
}

// Holds the run being viewed and, while it's running, keeps an EventSource
// open to its event stream. EventSource is the browser's built-in SSE
// client: it reconnects on its own after a dropped connection, and every
// reconnect starts with a fresh snapshot, so nothing is missed.
export function useRun(initialDetail: RunDetail | null) {
  const [state, dispatch] = useReducer(runReducer, {
    detail: initialDetail,
    progress: {},
  });
  const [connection, setConnection] = useState<ConnectionState>("idle");

  const runId = state.detail?.run.id ?? null;
  const isRunning = state.detail?.run.status === "running";

  useEffect(() => {
    if (!runId || !isRunning) return;

    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("reconnecting");
    source.onmessage = (message) => {
      const parsed = RunEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) return;

      dispatch(parsed.data);
      const status = runStatusOf(parsed.data);
      // The server closes the stream once the run stops running. Close our
      // side first, or EventSource would treat that as a drop and reconnect.
      if (status && status !== "running") {
        source.close();
        setConnection("idle");
      }
    };

    return () => source.close();
  }, [runId, isRunning]);

  return {
    detail: state.detail,
    progress: state.progress,
    connection,
    // Switch to another run (or none), e.g. from the run history.
    load: (detail: RunDetail | null) => dispatch({ type: "reset", detail }),
    // Apply a change made outside the stream, e.g. a review action's result.
    apply: dispatch,
  };
}
