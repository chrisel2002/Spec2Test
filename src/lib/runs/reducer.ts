import type { ReviewEventView, RunDetail, RunEvent, StepName } from "./types";

export type StepProgress = { done: number; total: number };

// Client-side state for the run being viewed: the run itself, plus
// in-node progress, which is live-only (never saved, so it isn't part of
// the DB snapshot).
export type RunState = {
  detail: RunDetail | null;
  progress: Partial<Record<StepName, StepProgress>>;
};

export type RunAction =
  | RunEvent
  | { type: "reset"; detail: RunDetail | null }
  // Client-only: a review action's history entry, from the API response.
  | { type: "reviewEvents"; events: ReviewEventView[] };

// Replaces items with a matching id in place, and appends new ones, so
// order stays stable as rows stream in and get updated.
function upsertById<T extends { id: string }>(items: T[], updates: T[]): T[] {
  const byId = new Map(updates.map((u) => [u.id, u]));
  const merged = items.map((item) => byId.get(item.id) ?? item);
  const existing = new Set(items.map((item) => item.id));
  return [...merged, ...updates.filter((u) => !existing.has(u.id))];
}

// Pure function from (state, event) to the next state, used with React's
// useReducer. Review actions reuse the same event shapes (a "testCases"
// event with the row the API returned), so there is one code path for
// "a row changed", whoever changed it.
export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === "reset") {
    return { detail: action.detail, progress: {} };
  }
  if (action.type === "snapshot") {
    return { detail: action.detail, progress: {} };
  }

  if (action.type === "progress") {
    return {
      ...state,
      progress: {
        ...state.progress,
        [action.step]: { done: action.done, total: action.total },
      },
    };
  }

  const detail = state.detail;
  if (!detail) return state;

  switch (action.type) {
    case "run":
      return { ...state, detail: { ...detail, run: action.run } };
    case "step": {
      const progress = { ...state.progress };
      // A finished step's progress counter is stale; the step row says it all.
      if (action.step.status !== "running") delete progress[action.step.step];
      return {
        detail: { ...detail, steps: upsertById(detail.steps, [action.step]) },
        progress,
      };
    }
    case "requirements":
      return {
        ...state,
        detail: {
          ...detail,
          requirements: upsertById(detail.requirements, action.requirements),
        },
      };
    case "testCases":
      return {
        ...state,
        detail: {
          ...detail,
          testCases: upsertById(detail.testCases, action.testCases),
        },
      };
    case "reviewEvents":
      return {
        ...state,
        detail: {
          ...detail,
          reviewEvents: upsertById(detail.reviewEvents, action.events),
        },
      };
  }
}
