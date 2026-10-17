import {
  CheckCircle2,
  Circle,
  Loader2,
  PauseCircle,
  XCircle,
} from "lucide-react";

import type { PipelineStep } from "@/lib/runs/pipeline-steps";
import { cn } from "cn";

function StepIcon({ step }: { step: PipelineStep }) {
  if (step.needsReview) {
    return <PauseCircle className="size-4 text-amber-600" aria-hidden />;
  }
  switch (step.state) {
    case "done":
      return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />;
    case "running":
      return <Loader2 className="size-4 animate-spin text-sky-600" aria-hidden />;
    case "failed":
      return <XCircle className="size-4 text-destructive" aria-hidden />;
    case "waiting":
      return <Circle className="size-4 text-muted-foreground/50" aria-hidden />;
  }
}

const STATE_LABEL: Record<PipelineStep["state"], string> = {
  done: "Done",
  running: "Running",
  waiting: "Waiting",
  failed: "Failed",
};

export function AgentSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <section aria-labelledby="agent-steps-heading">
      <h2
        id="agent-steps-heading"
        className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Agent steps
      </h2>
      <ol className="relative">
        {steps.map((step, i) => (
          <li
            key={step.key}
            data-testid={`step-${step.key}`}
            data-state={step.needsReview ? "review" : step.state}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {/* Connector line between step icons. */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-5 left-[7.5px] h-[calc(100%-1rem)] w-px",
                  step.state === "done" ? "bg-emerald-300" : "bg-border",
                )}
              />
            )}
            <span className="relative mt-0.5 bg-sidebar">
              <StepIcon step={step} />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm leading-5",
                  step.state === "waiting" && !step.needsReview
                    ? "text-muted-foreground"
                    : "font-medium",
                )}
              >
                {step.label}
                <span className="sr-only">: {STATE_LABEL[step.state]}</span>
              </p>
              {step.detail && (
                <p
                  className={cn(
                    "text-xs",
                    step.needsReview
                      ? "font-medium text-amber-700"
                      : step.state === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
