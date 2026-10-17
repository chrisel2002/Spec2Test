import { Loader2, Play, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RunStatus, RunSummary } from "@/lib/runs/types";
import { cn } from "cn";

const RUN_STATUS: Record<RunStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  waiting_for_review: {
    label: "Waiting for review",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, className } = RUN_STATUS[status];
  return (
    <Badge className={cn("gap-1", className)} data-testid="run-status" data-status={status}>
      {status === "running" && <Loader2 className="animate-spin" aria-hidden />}
      {label}
    </Badge>
  );
}

export function RunToolbar({
  run,
  canStart,
  starting,
  onStart,
  continuing,
  onBuildMatrix,
  children,
}: {
  run: RunSummary | null;
  canStart: boolean;
  starting: boolean;
  onStart: () => void;
  // A resume or retry request is in flight.
  continuing: boolean;
  onBuildMatrix: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      {run && <RunStatusBadge status={run.status} />}
      <div className="ml-auto flex items-center gap-2">
        {run?.status === "waiting_for_review" && (
          <Button onClick={onBuildMatrix} disabled={continuing}>
            {continuing ? <Loader2 className="animate-spin" aria-hidden /> : <Table2 aria-hidden />}
            Build matrix
          </Button>
        )}
        <Button
          variant={run ? "outline" : "default"}
          onClick={onStart}
          disabled={!canStart || starting}
        >
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {run ? "New run" : "Run agent"}
        </Button>
      </div>
    </div>
  );
}
