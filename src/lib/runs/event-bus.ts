import type { RunEvent } from "./types";

type Listener = (event: RunEvent) => void;

// In-process pub/sub between the background run (publisher) and any open
// event-stream requests for that run (subscribers). It decouples the run
// from the browser connection: closing the tab or refreshing doesn't stop
// the run, and a new connection simply subscribes again.
//
// The limit is that it only works within one server process. With several
// Cloud Run instances, a browser could connect to an instance that isn't
// running its run; Postgres LISTEN/NOTIFY or Redis pub/sub would be the
// next step. The DB snapshot each connection starts with keeps that
// failure mode to "no live updates", never wrong data.
export class RunEventBus {
  private listeners = new Map<string, Set<Listener>>();
  private active = new Set<string>();

  subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(listener);
    this.listeners.set(runId, set);

    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(runId);
    };
  }

  publish(runId: string, event: RunEvent): void {
    for (const listener of this.listeners.get(runId) ?? []) {
      listener(event);
    }
  }

  // "Active" means this process is executing the run right now. A run the
  // DB says is running but no process is executing was cut off by a
  // server restart, and can be marked failed so the user can retry it.
  markActive(runId: string): void {
    this.active.add(runId);
  }

  markInactive(runId: string): void {
    this.active.delete(runId);
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }
}

// Stored on globalThis so every route handler shares one bus: Next.js can
// load a module more than once (per route bundle, and again on hot reload),
// and two buses would mean a publisher nobody is listening to.
const globalForBus = globalThis as unknown as { runEventBus?: RunEventBus };
export const runEventBus = (globalForBus.runEventBus ??= new RunEventBus());
