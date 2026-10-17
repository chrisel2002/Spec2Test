"use client";

import { FileCode2, FileSpreadsheet, FileText, Info } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { exportAvailability, type ExportFormat } from "@/lib/export/availability";
import type { RunDetail } from "@/lib/runs/types";

function ExportButton({
  href,
  label,
  icon,
  disabledReason,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  disabledReason: string | null;
}) {
  if (disabledReason) {
    // A real disabled button (not a link), so it's announced as
    // unavailable; the reason is shown as text under the buttons.
    return (
      <Button variant="outline" size="sm" disabled title={disabledReason}>
        {icon}
        {label}
      </Button>
    );
  }
  // A plain link with `download`: the browser streams the file from the
  // export route, so nothing is held in memory on the page.
  return (
    <a href={href} download className={buttonVariants({ variant: "outline", size: "sm" })}>
      {icon}
      {label}
    </a>
  );
}

// Export buttons for the traceability matrix tab. Works for any run the
// tab is showing, including older runs opened from the run history, since
// everything is addressed by run id.
export function ExportBar({ detail }: { detail: RunDetail }) {
  const [approvedOnly, setApprovedOnly] = useState(false);
  const base = `/api/runs/${detail.run.id}/export`;

  const reason = (format: ExportFormat, options?: { approvedOnly?: boolean }) => {
    const availability = exportAvailability(detail, format, options);
    return availability.enabled ? null : availability.reason;
  };
  const csvReason = reason("csv", { approvedOnly });
  const playwrightReason = reason("playwright");
  const reportReason = reason("report");

  // Every export shares the same reason while the run isn't finished, so
  // show it once; otherwise list whichever exports are still unavailable.
  const reasons = [...new Set([csvReason, playwrightReason, reportReason].filter(Boolean))];

  return (
    <section aria-label="Export" className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium">Export</span>
        <ExportButton
          href={`${base}/csv${approvedOnly ? "?approvedOnly=true" : ""}`}
          label="Export CSV"
          icon={<FileSpreadsheet aria-hidden />}
          disabledReason={csvReason}
        />
        <label className="mr-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={approvedOnly}
            onChange={(e) => setApprovedOnly(e.target.checked)}
            className="size-3.5 accent-foreground"
          />
          Approved tests only
        </label>
        <ExportButton
          href={`${base}/playwright`}
          label="Export Playwright tests"
          icon={<FileCode2 aria-hidden />}
          disabledReason={playwrightReason}
        />
        <ExportButton
          href={`${base}/report`}
          label="Export report"
          icon={<FileText aria-hidden />}
          disabledReason={reportReason}
        />
      </div>
      {reasons.length > 0 && (
        <ul data-testid="export-disabled-reason" className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {reasons.map((text) => (
            <li key={text} className="flex items-start gap-1.5">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
