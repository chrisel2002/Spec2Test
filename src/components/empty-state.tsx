import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="mb-3 rounded-full bg-muted p-3">
        <Icon
          className={cn("size-6 text-muted-foreground", Icon === Loader2 && "animate-spin")}
          aria-hidden
        />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
