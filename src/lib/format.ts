const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 0) {
    throw new RangeError("bytes must be non-negative");
  }
  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const precision = exponent === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${UNITS[exponent]}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

// "just now", "5 minutes ago", "yesterday". `now` is a parameter so tests
// don't depend on the clock.
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < 60_000) return "just now";

  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (elapsed >= ms) return format.format(-Math.floor(elapsed / ms), unit);
  }
  return "just now";
}
