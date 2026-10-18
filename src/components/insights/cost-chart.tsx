"use client";

import { useState } from "react";

import { COST_STEPS, type CostStep, type RunCost, STEP_LABELS } from "@/lib/insights/aggregate";
import { niceCeiling } from "@/lib/insights/scale";
import { formatUsd } from "@/lib/runs/selectors";

// Fixed slot per step, so a step keeps its colour whatever runs are shown.
const STEP_COLOR: Record<CostStep, string> = {
  extract_requirements: "var(--chart-series-1)",
  check_ambiguity: "var(--chart-series-2)",
  generate_tests: "var(--chart-series-3)",
  regenerate_tests: "var(--chart-series-4)",
};

const PLOT_HEIGHT = 180;

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

// Estimated cost per run, stacked by agent step, oldest run on the left.
// Hover or focus a column for its per-step cost and tokens; the table
// under the charts has every number.
export function CostChart({ runs }: { runs: RunCost[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceCeiling(Math.max(...runs.map((r) => r.costUsd), 0));
  const ticks = [0, max / 2, max];

  return (
    <figure className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {COST_STEPS.map((step) => (
          <li key={step} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: STEP_COLOR[step] }} />
            {STEP_LABELS[step]}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex gap-2">
        {/* Y axis: three round ticks. */}
        <div className="relative w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(tick / max) * 100}%` }}>
              {formatUsd(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute inset-x-0 h-px"
              style={{
                bottom: `${(tick / max) * 100}%`,
                background: tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)",
              }}
            />
          ))}
          <ol className="relative flex items-end" style={{ height: PLOT_HEIGHT }} aria-label="Cost per run">
            {runs.map((run, i) => {
              const segments = COST_STEPS.filter((step) => run.steps[step].costUsd > 0);
              return (
                <li key={run.runId} className="relative flex h-full flex-1 justify-center">
                  <button
                    type="button"
                    className="flex h-full w-full items-end justify-center outline-none focus-visible:bg-muted/60"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={`${run.filename}, ${shortDate(run.createdAt)}: ${formatUsd(run.costUsd)}, ${run.tokens.toLocaleString("en")} tokens`}
                  >
                    <span
                      className="flex w-full max-w-6 flex-col-reverse gap-[2px]"
                      style={{ height: `${(run.costUsd / max) * 100}%` }}
                    >
                      {segments.map((step, s) => (
                        <span
                          key={step}
                          className={s === segments.length - 1 ? "rounded-t-[4px]" : ""}
                          style={{
                            background: STEP_COLOR[step],
                            // Each segment's share of the run's cost. (Raw
                            // costs as grow factors sum to far below 1, and
                            // CSS then hands out only that fraction.)
                            flexGrow: run.steps[step].costUsd / run.costUsd,
                            flexBasis: 0,
                            minHeight: 2,
                          }}
                        />
                      ))}
                    </span>
                  </button>

                  {active === i && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute top-0 z-10 w-72 rounded-lg border bg-popover p-3 text-xs shadow-md"
                      // Beside the column, on whichever side has room.
                      style={i >= runs.length / 2 ? { right: "100%" } : { left: "100%" }}
                    >
                      <p className="font-medium text-foreground">{run.filename}</p>
                      <p className="mb-2 text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      <table className="w-full tabular-nums">
                        <tbody>
                          {COST_STEPS.filter((step) => run.steps[step].tokens > 0).map((step) => (
                            <tr key={step}>
                              <td className="py-0.5 pr-2">
                                <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: STEP_COLOR[step] }} />
                                {STEP_LABELS[step]}
                              </td>
                              <td className="whitespace-nowrap text-right text-muted-foreground">{run.steps[step].tokens.toLocaleString("en")} tok</td>
                              <td className="pl-2 text-right">{formatUsd(run.steps[step].costUsd)}</td>
                            </tr>
                          ))}
                          <tr className="border-t font-medium">
                            <td className="pt-1">Total</td>
                            <td className="whitespace-nowrap pt-1 text-right">{run.tokens.toLocaleString("en")} tok</td>
                            <td className="pt-1 pl-2 text-right">{formatUsd(run.costUsd)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {runs.length > 0 && (
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
              <span>{shortDate(runs[0].createdAt)}</span>
              {runs.length > 1 && <span>{shortDate(runs[runs.length - 1].createdAt)}</span>}
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
