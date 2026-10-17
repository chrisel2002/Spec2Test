import { Badge } from "@/components/ui/badge";
import type { TestCaseStatus, TestCaseView } from "@/lib/runs/types";
import { cn } from "cn";

const STATUS_STYLES: Record<TestCaseStatus, string> = {
  draft: "border-border bg-background text-muted-foreground",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABEL: Record<TestCaseStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
};

export function TestStatusBadge({ status }: { status: TestCaseStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]} data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const TYPE_DOT: Record<TestCaseView["type"], string> = {
  positive: "bg-sky-500",
  negative: "bg-rose-500",
  boundary: "bg-violet-500",
};

export function TestTypeBadge({ type }: { type: TestCaseView["type"] }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", TYPE_DOT[type])} />
      {type}
    </Badge>
  );
}
