import { Badge } from "@/components/ui/badge";

const AGENT_STEPS = [
  { label: "Parse document" },
  { label: "Extract requirements" },
  { label: "Flag ambiguities" },
  { label: "Generate test cases" },
  { label: "Build traceability matrix" },
];

export function AgentStepsSidebar() {
  return (
    <aside className="w-56 shrink-0 border-r p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Agent steps
      </h2>
      <ol className="space-y-2">
        {AGENT_STEPS.map((step) => (
          <li
            key={step.label}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span>{step.label}</span>
            <Badge variant="outline">Pending</Badge>
          </li>
        ))}
      </ol>
    </aside>
  );
}
