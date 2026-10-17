import "server-only";

import { getRun } from "@/lib/services/runs";

import { runEventBus } from "./event-bus";
import type { RunEvent } from "./types";

const HEARTBEAT_MS = 15_000;
// How often to re-read a run that another process is executing.
const POLL_MS = 2_000;

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
      let poll: ReturnType<typeof setInterval> | undefined;
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(poll);
      };
      signal.addEventListener("abort", close);

      const detail = await getRun(runId).catch(() => null);
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

      // The event bus only carries events from runs executing in this
      // process. A run the MCP server (or another web app instance) is
      // executing publishes nowhere we can hear, so fall back to re-reading
      // it from the DB and sending a fresh snapshot whenever it changes.
      // Coarser than live events (no in-step progress), but correct.
      if (!runEventBus.isActive(runId)) {
        let last = JSON.stringify(detail);
        poll = setInterval(async () => {
          const latest = await getRun(runId).catch(() => null);
          if (!latest || closed) return;
          const json = JSON.stringify(latest);
          if (json !== last) {
            last = json;
            send({ type: "snapshot", detail: latest });
          }
          if (latest.run.status !== "running") send({ type: "run", run: latest.run });
        }, POLL_MS);
      }
    },
    cancel() {
      cleanup();
    },
  });
}
