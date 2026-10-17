import { describe, expect, it } from "vitest";

import { formatFileSize, formatRelativeTime } from "@/lib/format";

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

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");

  it("says just now for under a minute", () => {
    expect(formatRelativeTime("2026-10-17T11:59:30.000Z", now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelativeTime("2026-10-17T11:55:00.000Z", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-10-17T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-10-16T12:00:00.000Z", now)).toBe("yesterday");
  });
});
