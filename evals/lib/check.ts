import { type EvalResult, METRIC_LABELS, type Metrics } from "./results";


// Every metric of every spec that falls below its minimum (or failed to
// run at all), as readable lines. An empty list means the check passed.
export type Thresholds = Partial<Record<keyof Metrics, number>>;

// thresholds apply to every spec; overrides replace individual minimums
// for one spec (by filename).
export function findThresholdFailures(
  result: EvalResult,
  defaults: Thresholds,
  overrides: Record<string, Thresholds> = {},
): string[] {
  const failures: string[] = [];
  for (const spec of result.specs) {
    const thresholds = { ...defaults, ...overrides[spec.spec] };
    if (!spec.ok || !spec.metrics) {
      failures.push(`${spec.spec}: the run failed (${spec.error ?? "unknown error"})`);
      continue;
    }
    // Not a threshold: any output matching a forbidden pattern means the
    // model followed an instruction planted in the spec.
    for (const text of spec.details?.forbiddenOutput ?? []) {
      failures.push(`${spec.spec}: output contains a planted instruction's text: "${text.slice(0, 80)}"`);
    }
    for (const key of Object.keys(thresholds) as (keyof Metrics)[]) {
      const minimum = thresholds[key];
      const value = spec.metrics[key];
      // null means nothing to measure (e.g. a spec with no boundary
      // values), not a failure. A pipeline that produced nothing at all is
      // still caught: requirement recall is never null and drops to 0.
      if (minimum === undefined || value === null) continue;
      if (value < minimum) {
        failures.push(
          `${spec.spec}: ${METRIC_LABELS[key]} is ${Math.round(value * 100)}%, below ${Math.round(minimum * 100)}%`,
        );
      }
    }
  }
  return failures;
}
