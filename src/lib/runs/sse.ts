import "server-only";

import { loadRunDetail } from "@/lib/agents/runner";

import { runEventBus } from "./event-bus";
import type { RunEvent } from "./types";

const HEARTBEAT_MS = 15_000;

// Server-sent events for one run: a snapshot of the run from the DB, then
// every live event until the run stops running (paused for review,
// completed, or failed), at which point the stream closes.
//
// Ordering detail: we subscribe *before* reading the snapshot, and buffer
// live events until the snapshot is sent. Reading first would leave a gap
// where an event fired between the DB read and the subscribe is lost.
// Buffering instead can deliver an event that's already in the snapshot,
// which is harmless because every event carries full rows.
export function createRunEventStream(
  runId: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream({
    async start(controller) {
      let closed = false;
      let snapshotSent = false;
      const buffered: RunEvent[] = [];

      function close() {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      }

      function send(event: RunEvent) {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "run" && event.run.status !== "running") close();
      }

      const unsubscribe = runEventBus.subscribe(runId, (event) => {
        if (snapshotSent) send(event);
        else buffered.push(event);
      });
      // A comment line every 15s keeps proxies and load balancers from
      // closing a connection that's quiet during a long model call.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, HEARTBEAT_MS);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      signal.addEventListener("abort", close);

      const detail = await loadRunDetail(runId);
      if (!detail) {
        close();
        return;
      }

      send({ type: "snapshot", detail });
      snapshotSent = true;
      if (detail.run.status !== "running") {
        close();
        return;
      }
      buffered.forEach(send);
    },
    cancel() {
      cleanup();
    },
  });
}
