import { History } from "lucide-react";

import type { RunStatus, RunSummary } from "@/lib/runs/types";

const STATUS_TEXT: Record<RunStatus, string> = {
  running: "running",
  waiting_for_review: "waiting for review",
  completed: "completed",
  failed: "failed",
};

function formatStarted(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Past runs of the selected document, newest first. A native <select>:
// accessible and keyboard-friendly for free, and the list is short.
export function RunPicker({
  runs,
  selectedId,
  disabled,
  onSelect,
}: {
  runs: RunSummary[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (runId: string) => void;
}) {
  if (runs.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <History className="size-4" aria-hidden />
      <span className="sr-only">Run history</span>
      <select
        aria-label="Run history"
        value={selectedId ?? ""}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {runs.map((run, i) => (
          // Times are formatted in the local timezone, which can differ
          // between the server render and the browser.
          <option key={run.id} value={run.id} suppressHydrationWarning>
            Run #{runs.length - i} · {formatStarted(run.createdAt)} · {STATUS_TEXT[run.status]}
          </option>
        ))}
      </select>
    </label>
  );
}
