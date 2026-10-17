import type { StepName, StepView } from "./types";

// A step can have several rows (one per attempt); rows arrive in start
// order, so the last one seen for a step name is its current state.
export function latestSteps(
  steps: StepView[],
): Partial<Record<StepName, StepView>> {
  const latest: Partial<Record<StepName, StepView>> = {};
  for (const step of steps) latest[step.step] = step;
  return latest;
}

// Summed over every row, not just the latest per step: a failed attempt
// that got partway still spent tokens, and so does every regeneration.
export function totalCostUsd(steps: StepView[]): number {
  return steps.reduce((sum, step) => sum + (step.costUsd ?? 0), 0);
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
