"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

import { TestCaseCard } from "@/components/requirements/test-case-card";
import { TestCaseEditForm } from "@/components/review/test-case-edit-form";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import type { EditableTestCase, ReviewChange } from "@/lib/review/transitions";
import type { ReviewEventView, TestCaseView } from "@/lib/runs/types";

const ACTION_LABEL: Record<ReviewEventView["action"], string> = {
  approved: "Approved",
  rejected: "Rejected",
  edited: "Edited and approved",
  requirement_rewritten: "Requirement rewritten",
};

function ReviewHistory({ events }: { events: ReviewEventView[] }) {
  if (events.length === 0) return null;
  const latest = events[events.length - 1];

  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">
        {ACTION_LABEL[latest.action]} by <span className="font-medium">{latest.actor}</span>{" "}
        <time dateTime={latest.createdAt} suppressHydrationWarning>
          {formatRelativeTime(latest.createdAt)}
        </time>
        {events.length > 1 && ` · ${events.length} changes`}
      </summary>
      <ol className="mt-1.5 space-y-1 border-l pl-3">
        {events.map((event) => (
          <li key={event.id}>
            <span className="font-medium text-foreground">{event.actor}</span>{" "}
            {ACTION_LABEL[event.action].toLowerCase()}
            {event.fromStatus && event.toStatus && ` (${event.fromStatus} → ${event.toStatus})`}
            {event.changes && Object.keys(event.changes).length > 0 && (
              <span>: changed {Object.keys(event.changes).join(", ")}</span>
            )}{" "}
            <time dateTime={event.createdAt} title={event.createdAt} suppressHydrationWarning>
              {formatRelativeTime(event.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}

// A test case with Approve / Edit / Reject controls and its review history.
export function TestCaseReview({
  testCase,
  events,
  reviewable,
  onReview,
}: {
  testCase: TestCaseView;
  events: ReviewEventView[];
  reviewable: boolean;
  // Resolves with an error message, or null on success.
  onReview: (testCaseId: string, change: ReviewChange) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(change: ReviewChange) {
    setPending(true);
    setError(null);
    const failure = await onReview(testCase.id, change);
    setPending(false);
    setError(failure);
    if (!failure) setEditing(false);
  }

  const actions = reviewable && !editing && (
    <>
      <Button
        size="xs"
        variant="ghost"
        className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400"
        onClick={() => submit({ action: "approve" })}
        disabled={pending || testCase.status === "approved"}
        aria-label={`Approve ${testCase.title}`}
      >
        <Check aria-hidden />
        Approve
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label={`Edit ${testCase.title}`}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button
        size="xs"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => submit({ action: "reject" })}
        disabled={pending || testCase.status === "rejected"}
        aria-label={`Reject ${testCase.title}`}
      >
        <X aria-hidden />
        Reject
      </Button>
    </>
  );

  return (
    <TestCaseCard
      testCase={testCase}
      actions={actions || undefined}
      body={
        editing ? (
          <TestCaseEditForm
          testCase={testCase}
          saving={pending}
          error={error}
          onSave={(values: EditableTestCase) => submit({ action: "edit", testCase: values })}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          />
        ) : undefined
      }
      footer={
        !editing && (
          <>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <ReviewHistory events={events} />
          </>
        )
      }
    />
  );
}
