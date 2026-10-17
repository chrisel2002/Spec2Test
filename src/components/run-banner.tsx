import {
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  WifiOff,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ConnectionState } from "@/hooks/use-run";
import { isTestable } from "@/lib/review/coverage";
import type { PipelineStep } from "@/lib/runs/pipeline-steps";
import type { RunDetail } from "@/lib/runs/types";
import { cn } from "cn";

const TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
  warn: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  error: "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
};

function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid="run-banner"
      data-tone={tone}
      className={cn("flex items-start gap-3 rounded-xl border p-3.5", TONES[tone])}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-4.5">{icon}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 opacity-85">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// One banner above the tabs saying what state the run is in and what, if
// anything, the user should do next.
export function RunBanner({
  detail,
  steps,
  connection,
  continuing,
  onRetry,
}: {
  detail: RunDetail;
  steps: PipelineStep[];
  connection: ConnectionState;
  continuing: boolean;
  onRetry: () => void;
}) {
  const { run } = detail;

  switch (run.status) {
    case "running": {
      const current = steps.find((s) => s.state === "running");
      return (
        <Banner
          tone="info"
          icon={connection === "reconnecting" ? <WifiOff /> : <Loader2 className="animate-spin" />}
          title={
            connection === "reconnecting"
              ? "Connection lost. Reconnecting…"
              : current
                ? `${current.label}${current.detail ? `: ${current.detail}` : ""}`
                : "Starting the agent…"
          }
        >
          The run keeps going if you leave or refresh this page.
        </Banner>
      );
    }

    case "failed": {
      const retry = (
        <Button size="sm" variant="outline" className="bg-background" onClick={onRetry} disabled={continuing}>
          {continuing ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          Retry
        </Button>
      );
      if (run.rateLimited) {
        return (
          <Banner tone="warn" icon={<Clock />} title="The model's rate limit was hit" action={retry}>
            The provider is asking us to slow down. Wait a minute, then retry. Steps that already
            finished won&rsquo;t run again.
          </Banner>
        );
      }
      const failedStep = steps.find((s) => s.state === "failed");
      return (
        <Banner
          tone="error"
          icon={<XCircle />}
          title={failedStep ? `The run failed at “${failedStep.label}”` : "The run failed"}
          action={retry}
        >
          {run.error ?? "Something went wrong."} Retrying continues from the failed step.
        </Banner>
      );
    }

    case "waiting_for_review": {
      const drafts = detail.testCases.filter((tc) => tc.status === "draft").length;
      const unresolved = detail.requirements.filter((r) => !isTestable(r)).length;
      if (drafts === 0 && unresolved === 0) {
        return (
          <Banner tone="success" icon={<CheckCircle2 />} title="Nothing left to review">
            Every test case has been approved or rejected. Build the matrix to sign off this run.
          </Banner>
        );
      }
      return (
        <Banner tone="warn" icon={<ClipboardCheck />} title="Waiting for your review">
          {drafts} draft {drafts === 1 ? "test" : "tests"} to approve, edit, or reject
          {unresolved > 0 &&
            ` and ${unresolved} ambiguous ${unresolved === 1 ? "requirement" : "requirements"} to resolve`}
          . Build the matrix when you&rsquo;re done.
        </Banner>
      );
    }

    case "completed": {
      if (detail.requirements.length === 0) return null;
      const coverage = run.coverage;
      return (
        <Banner tone="success" icon={<CheckCircle2 />} title="Matrix built">
          {coverage && coverage.total > 0
            ? `Signed off at ${Math.round((coverage.covered / coverage.total) * 100)}% coverage (${coverage.covered} of ${coverage.total} testable requirements). `
            : ""}
          This run is now read-only; start a new run to review again.
        </Banner>
      );
    }
  }
}
