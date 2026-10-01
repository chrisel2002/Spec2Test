import { describe, expect, it } from "vitest";

import { formatFileSize } from "@/lib/format";

describe("formatFileSize", () => {
  it("formats zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes below 1 KB with no decimals", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("throws for negative input", () => {
    expect(() => formatFileSize(-1)).toThrow(RangeError);
  });
});
