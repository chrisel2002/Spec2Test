// A round axis maximum at or above `value`: the next 1, 2, 2.5, or 5 times
// a power of ten (0.0013 -> 0.002, 37 -> 50), so tick labels are clean
// numbers instead of the raw maximum.
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}
