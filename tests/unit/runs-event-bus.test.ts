import { describe, expect, it, vi } from "vitest";

import { RunEventBus } from "@/lib/runs/event-bus";
import type { RunEvent } from "@/lib/runs/types";

const progress: RunEvent = { type: "progress", step: "generate_tests", done: 1, total: 3 };

describe("RunEventBus", () => {
  it("delivers events only to subscribers of that run", () => {
    const bus = new RunEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("run-a", a);
    bus.subscribe("run-b", b);

    bus.publish("run-a", progress);

    expect(a).toHaveBeenCalledWith(progress);
    expect(b).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new RunEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("run-a", listener);

    unsubscribe();
    bus.publish("run-a", progress);

    expect(listener).not.toHaveBeenCalled();
  });

  it("tracks which runs this process is executing", () => {
    const bus = new RunEventBus();
    bus.markActive("run-a");
    expect(bus.isActive("run-a")).toBe(true);

    bus.markInactive("run-a");
    expect(bus.isActive("run-a")).toBe(false);
  });
});
