"use client";

import { useState } from "react";

import { ListenButton } from "@/components/listen-button";
import { RequirementCard } from "@/components/requirements/requirement-card";
import { Button } from "@/components/ui/button";
import type { RequirementView, TestCaseView } from "@/lib/runs/types";

async function fetchRunSummary(runId: string): Promise<string> {
  const response = await fetch(`/api/runs/${runId}/summary`);
  if (!response.ok) throw new Error("Couldn't load the run summary");
  const body: { summary: string } = await response.json();
  return body.summary;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function RequirementSkeleton() {
  return (
    <li className="animate-pulse rounded-xl border bg-card p-4" aria-hidden>
      <div className="mb-2 flex gap-2">
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>
      <div className="h-3 w-3/4 rounded bg-muted" />
    </li>
  );
}

export function RequirementsPanel({
  runId,
  requirements,
  testCases,
  extracting,
  voiceEnabled,
  renderTestCase,
  renderAmbiguityFooter,
}: {
  runId: string;
  requirements: RequirementView[];
  testCases: TestCaseView[];
  // Extraction is still running, so more cards are on the way.
  extracting: boolean;
  voiceEnabled: boolean;
  renderTestCase?: (testCase: TestCaseView) => React.ReactNode;
  renderAmbiguityFooter?: (requirement: RequirementView) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const testsByRequirement = new Map<string, TestCaseView[]>();
  for (const tc of testCases) {
    const list = testsByRequirement.get(tc.requirementId) ?? [];
    list.push(tc);
    testsByRequirement.set(tc.requirementId, list);
  }

  const allExpanded =
    requirements.length > 0 && requirements.every((r) => expanded.has(r.id));

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Requirements" value={requirements.length} />
        <Stat
          label="Ambiguous"
          value={requirements.filter((r) => r.isAmbiguous && !r.ambiguityResolved).length}
        />
        <Stat label="Test cases" value={testCases.length} />
        <Stat
          label="Approved"
          value={testCases.filter((tc) => tc.status === "approved").length}
        />
      </div>

      {requirements.length > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setExpanded(allExpanded ? new Set() : new Set(requirements.map((r) => r.id)))
            }
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
          {voiceEnabled && !extracting && (
            <ListenButton
              label="Listen to summary"
              getText={() => fetchRunSummary(runId)}
            />
          )}
        </div>
      )}

      <ul className="space-y-3" aria-label="Requirements" aria-busy={extracting}>
        {requirements.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            testCases={testsByRequirement.get(requirement.id) ?? []}
            expanded={expanded.has(requirement.id)}
            onToggle={() => toggle(requirement.id)}
            renderTestCase={renderTestCase}
            ambiguityFooter={renderAmbiguityFooter?.(requirement)}
          />
        ))}
        {extracting && (
          <>
            <RequirementSkeleton />
            <RequirementSkeleton />
          </>
        )}
      </ul>
    </div>
  );
}
