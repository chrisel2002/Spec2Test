import { type EvalResult, METRIC_LABELS, type Metrics } from "./results";

// Every metric of every spec that falls below its minimum (or failed to
// run at all), as readable lines. An empty list means the check passed.
export function findThresholdFailures(
  result: EvalResult,
  thresholds: Partial<Record<keyof Metrics, number>>,
): string[] {
  const failures: string[] = [];
  for (const spec of result.specs) {
    if (!spec.ok || !spec.metrics) {
      failures.push(`${spec.spec}: the run failed (${spec.error ?? "unknown error"})`);
      continue;
    }
    for (const key of Object.keys(thresholds) as (keyof Metrics)[]) {
      const minimum = thresholds[key];
      const value = spec.metrics[key];
      if (minimum === undefined) continue;
      if (value === null || value < minimum) {
        const shown = value === null ? "n/a" : `${Math.round(value * 100)}%`;
        failures.push(`${spec.spec}: ${METRIC_LABELS[key]} is ${shown}, below ${Math.round(minimum * 100)}%`);
      }
    }
  }
  return failures;
}
