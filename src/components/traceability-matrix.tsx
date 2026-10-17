"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import { useState } from "react";

import { ExportBar } from "@/components/export-bar";
import { TestStatusBadge, TestTypeBadge } from "@/components/status-badges";
import { calculateCoverage, type Gap } from "@/lib/review/coverage";
import { buildMatrixRows, countGaps, type MatrixFilter } from "@/lib/review/matrix";
import type { RunDetail } from "@/lib/runs/types";
import { cn } from "cn";

const STATUS_FILTERS: { value: MatrixFilter["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function GapCell({ gap }: { gap: Gap | null }) {
  if (gap === "unresolved_ambiguity") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-4" aria-hidden />
        Unresolved ambiguity
      </span>
    );
  }
  if (gap === "no_approved_tests") {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400">
        <CircleSlash className="size-4" aria-hidden />
        No approved tests
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-4" aria-hidden />
      Covered
    </span>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
          tone === "bad" && "text-red-700 dark:text-red-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function TraceabilityMatrix({ detail }: { detail: RunDetail }) {
  const [filter, setFilter] = useState<MatrixFilter>({ status: "all", gapsOnly: false });

  const coverage = calculateCoverage(detail.requirements, detail.testCases);
  const allRows = buildMatrixRows(detail.requirements, detail.testCases, {
    status: "all",
    gapsOnly: false,
  });
  const gaps = countGaps(allRows);
  const rows = buildMatrixRows(detail.requirements, detail.testCases, filter);
  const isDraft = detail.run.status === "waiting_for_review";

  return (
    <div className="space-y-4">
      {isDraft && (
        <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          This is a live preview. Review is still open; click Build matrix when you&rsquo;re done to
          sign it off.
        </p>
      )}

      <ExportBar detail={detail} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile
          label="Coverage"
          value={coverage.percent === null ? "—" : `${coverage.percent}%`}
          tone={coverage.percent === 100 ? "good" : undefined}
        />
        <SummaryTile label="Requirements" value={String(detail.requirements.length)} />
        <SummaryTile
          label="No approved tests"
          value={String(gaps.no_approved_tests)}
          tone={gaps.no_approved_tests > 0 ? "bad" : "good"}
        />
        <SummaryTile
          label="Unresolved ambiguity"
          value={String(gaps.unresolved_ambiguity)}
          tone={gaps.unresolved_ambiguity > 0 ? "warn" : "good"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by test status" className="inline-flex rounded-lg bg-muted p-[3px]">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter.status === value}
              onClick={() => setFilter((f) => ({ ...f, status: value }))}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground",
                filter.status === value && "bg-background text-foreground shadow-sm",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filter.gapsOnly}
            onChange={(e) => setFilter((f) => ({ ...f, gapsOnly: e.target.checked }))}
            className="size-4 accent-foreground"
          />
          Gaps only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {detail.requirements.length} requirements
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm" aria-label="Traceability matrix">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[34%] px-4 py-2.5 font-medium">Requirement</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Linked test cases</th>
              <th scope="col" className="w-52 px-4 py-2.5 font-medium">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  {filter.gapsOnly && filter.status === "all"
                    ? "No gaps: every testable requirement has an approved test."
                    : "No requirements match these filters."}
                </td>
              </tr>
            )}
            {rows.map(({ requirement, testCases, gap }) => (
              <tr
                key={requirement.id}
                data-testid="matrix-row"
                data-code={requirement.code}
                data-gap={gap ?? "none"}
                className={cn(
                  "border-b align-top last:border-0",
                  gap === "no_approved_tests" && "bg-red-50/60 dark:bg-red-950/20",
                  gap === "unresolved_ambiguity" && "bg-amber-50/70 dark:bg-amber-950/20",
                )}
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="block font-mono text-xs text-muted-foreground">{requirement.code}</span>
                  <span className="font-medium">{requirement.title}</span>
                </th>
                <td className="px-4 py-3">
                  {testCases.length === 0 ? (
                    <span className="text-muted-foreground">No linked tests</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {testCases.map((tc) => (
                        <li
                          key={tc.id}
                          data-testid="matrix-test"
                          data-status={tc.status}
                          className="flex items-center gap-2"
                        >
                          <span className="min-w-0 flex-1 truncate" title={tc.title}>{tc.title}</span>
                          <TestTypeBadge type={tc.type} />
                          <TestStatusBadge status={tc.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3">
                  <GapCell gap={gap} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
