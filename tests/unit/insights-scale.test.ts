import { describe, expect, it } from "vitest";

import { niceCeiling } from "@/lib/insights/scale";

describe("niceCeiling", () => {
  it("rounds up to 1, 2, 2.5, or 5 times a power of ten", () => {
    expect(niceCeiling(0.0013)).toBeCloseTo(0.002);
    expect(niceCeiling(37)).toBe(50);
    expect(niceCeiling(2.2)).toBe(2.5);
    expect(niceCeiling(7)).toBe(10);
  });

  it("keeps a value that is already round", () => {
    expect(niceCeiling(200)).toBe(200);
  });

  it("gives an empty chart a scale of 1", () => {
    expect(niceCeiling(0)).toBe(1);
  });
});
