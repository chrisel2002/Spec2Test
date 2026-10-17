"use client";

import { RequirementsPanel } from "@/components/requirements-panel";
import { AmbiguityResolver } from "@/components/review/ambiguity-resolver";
import { TestCaseReview } from "@/components/review/test-case-review";
import type { RunAction } from "@/lib/runs/reducer";
import {
  type ReviewEventView,
  type RunDetail,
  RunDetailSchema,
  ReviewEventViewSchema,
  TestCaseViewSchema,
} from "@/lib/runs/types";
import { isReviewOpen, type ReviewChange } from "@/lib/review/transitions";

async function errorMessage(response: Response, fallback: string) {
  const body: { error?: string } = await response.json().catch(() => ({}));
  return body.error ?? fallback;
}

// The Requirements tab with review controls attached. Review results are
// applied to the run state with the same actions the event stream uses,
// so the sidebar's coverage and the matrix update on the spot.
export function RequirementsReview({
  detail,
  extracting,
  actor,
  voiceEnabled,
  apply,
  load,
}: {
  detail: RunDetail;
  extracting: boolean;
  actor: string;
  voiceEnabled: boolean;
  apply: (action: RunAction) => void;
  load: (detail: RunDetail) => void;
}) {
  const reviewable = isReviewOpen(detail.run.status);

  const eventsByTestCase = new Map<string, ReviewEventView[]>();
  for (const event of detail.reviewEvents) {
    if (!event.testCaseId) continue;
    const list = eventsByTestCase.get(event.testCaseId) ?? [];
    list.push(event);
    eventsByTestCase.set(event.testCaseId, list);
  }

  async function review(testCaseId: string, change: ReviewChange) {
    const response = await fetch(`/api/test-cases/${testCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor, change }),
    });
    if (!response.ok) return errorMessage(response, "Couldn't save the review");

    const body = await response.json();
    apply({ type: "testCases", testCases: [TestCaseViewSchema.parse(body.testCase)] });
    apply({ type: "reviewEvents", events: [ReviewEventViewSchema.parse(body.event)] });
    return null;
  }

  async function resolve(requirementId: string, text: string) {
    const response = await fetch(`/api/requirements/${requirementId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor, text }),
    });
    if (!response.ok) return errorMessage(response, "Couldn't regenerate the tests");

    load(RunDetailSchema.parse(await response.json()));
    return null;
  }

  return (
    <RequirementsPanel
      runId={detail.run.id}
      requirements={detail.requirements}
      testCases={detail.testCases}
      extracting={extracting}
      voiceEnabled={voiceEnabled}
      renderTestCase={(testCase) => (
        <TestCaseReview
          key={testCase.id}
          testCase={testCase}
          events={eventsByTestCase.get(testCase.id) ?? []}
          reviewable={reviewable}
          onReview={review}
        />
      )}
      renderAmbiguityFooter={(requirement) => (
        <AmbiguityResolver
          requirement={requirement}
          actor={actor}
          reviewable={reviewable}
          onResolve={resolve}
        />
      )}
    />
  );
}
