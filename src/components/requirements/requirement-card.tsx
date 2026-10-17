import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { TestCaseCard } from "@/components/requirements/test-case-card";
import { Badge } from "@/components/ui/badge";
import type { RequirementView, TestCaseView } from "@/lib/runs/types";
import { cn } from "cn";

function TestCountBadge({ testCases }: { testCases: TestCaseView[] }) {
  const approved = testCases.filter((tc) => tc.status === "approved").length;
  return (
    <Badge variant="secondary" className="tabular-nums" data-testid="test-count">
      {testCases.length} {testCases.length === 1 ? "test" : "tests"}
      {approved > 0 && (
        <span className="text-emerald-700 dark:text-emerald-400">
          · {approved} approved
        </span>
      )}
    </Badge>
  );
}

function AmbiguityPanel({
  requirement,
  footer,
}: {
  requirement: RequirementView;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p>
        <span className="font-medium text-amber-800 dark:text-amber-300">Why it&rsquo;s ambiguous: </span>
        {requirement.ambiguityReason}
      </p>
      <div>
        <p className="mb-1 font-medium text-amber-800 dark:text-amber-300">Suggested rewrite</p>
        <blockquote className="border-l-2 border-amber-400 pl-3 text-foreground/90">
          {requirement.suggestedRewrite}
        </blockquote>
      </div>
      {footer}
    </div>
  );
}

export function RequirementCard({
  requirement,
  testCases,
  expanded,
  onToggle,
  renderTestCase,
  ambiguityFooter,
}: {
  requirement: RequirementView;
  testCases: TestCaseView[];
  expanded: boolean;
  onToggle: () => void;
  // Lets the review layer wrap each test case with its controls.
  renderTestCase?: (testCase: TestCaseView) => React.ReactNode;
  ambiguityFooter?: React.ReactNode;
}) {
  const unresolved = requirement.isAmbiguous && !requirement.ambiguityResolved;
  const bodyId = `requirement-${requirement.id}-tests`;

  return (
    <li
      data-testid="requirement-card"
      data-code={requirement.code}
      className={cn(
        "animate-in rounded-xl border bg-card shadow-xs duration-300 fade-in slide-in-from-bottom-1",
        unresolved &&
          "border-amber-300 ring-1 ring-amber-200 dark:border-amber-800 dark:ring-amber-900",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-xl p-4 text-left hover:bg-muted/40"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{requirement.code}</span>
            <span className="font-medium">{requirement.title}</span>
            {unresolved && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                <AlertTriangle aria-hidden />
                Ambiguous
              </Badge>
            )}
            {requirement.ambiguityResolved && (
              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 aria-hidden />
                Resolved
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{requirement.text}</p>
          {requirement.ambiguityResolved && requirement.originalText && (
            <p className="mt-1 text-xs text-muted-foreground/80">
              Originally: <span className="line-through">{requirement.originalText}</span>
            </p>
          )}
        </div>
        <TestCountBadge testCases={testCases} />
      </button>

      {(unresolved || expanded) && (
        <div className="px-4 pb-4 pl-11">
          {unresolved && (
            <AmbiguityPanel requirement={requirement} footer={ambiguityFooter} />
          )}
          {expanded && (
            <div id={bodyId} className="mt-3">
              {testCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No test cases yet.</p>
              ) : (
                <ul className="space-y-2">
                  {testCases.map((tc) =>
                    renderTestCase ? renderTestCase(tc) : <TestCaseCard key={tc.id} testCase={tc} />,
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
