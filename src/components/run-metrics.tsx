import type { Coverage } from "@/lib/review/coverage";
import { formatUsd } from "@/lib/runs/selectors";

// Live coverage and cost for the selected run, under the agent steps.
// Both are recomputed from run state on every render, so they move as
// tests stream in and as the reviewer approves them.
export function RunMetrics({
  coverage,
  costUsd,
}: {
  coverage: Coverage;
  costUsd: number;
}) {
  const percent = coverage.percent ?? 0;

  return (
    <section aria-label="Run metrics" className="space-y-4 rounded-lg border bg-background p-3">
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Coverage
          </h2>
          <span data-testid="coverage-percent" className="text-xl font-semibold tabular-nums">
            {coverage.percent === null ? "—" : `${coverage.percent}%`}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Coverage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {coverage.total === 0
            ? "No testable requirements yet"
            : `${coverage.covered} of ${coverage.total} testable requirements have an approved test`}
        </p>
      </div>
      <div className="flex items-baseline justify-between border-t pt-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Est. cost
        </h2>
        <span
          className="text-sm font-medium tabular-nums"
          title="Estimated from token usage at the provider's paid-tier rates"
        >
          {formatUsd(costUsd)}
        </span>
      </div>
    </section>
  );
}
