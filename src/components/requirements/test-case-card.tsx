import { TestStatusBadge, TestTypeBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import type { TestCaseView } from "@/lib/runs/types";
import { cn } from "cn";

function Step({ keyword, text }: { keyword: string; text: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {keyword}
      </dt>
      <dd className="text-sm">{text}</dd>
    </>
  );
}

export function GivenWhenThen({ testCase }: { testCase: TestCaseView }) {
  return (
    <dl className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5">
      <Step keyword="Given" text={testCase.given} />
      <Step keyword="When" text={testCase.when} />
      <Step keyword="Then" text={testCase.then} />
    </dl>
  );
}

export function TestCaseCard({
  testCase,
  actions,
  body,
  footer,
}: {
  testCase: TestCaseView;
  // Review controls, rendered in the header.
  actions?: React.ReactNode;
  // Replaces the Given/When/Then block, e.g. with an edit form.
  body?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <li
      data-testid="test-case"
      data-status={testCase.status}
      className={cn(
        "rounded-lg border bg-background p-3 transition-colors",
        testCase.status === "approved" && "border-emerald-200 dark:border-emerald-900",
        testCase.status === "rejected" && "opacity-60",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{testCase.title}</span>
        <TestTypeBadge type={testCase.type} />
        <TestStatusBadge status={testCase.status} />
        {testCase.basedOnAssumption && (
          <Badge
            variant="outline"
            className="border-amber-200 text-amber-700"
            title="Generated from the suggested rewrite of an ambiguous requirement"
          >
            based on assumption
          </Badge>
        )}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      {body ?? <GivenWhenThen testCase={testCase} />}
      {footer}
    </li>
  );
}
