import { AgentSteps } from "@/components/agent-steps";
import { DocumentList, type DocumentSummary } from "@/components/document-list";
import { RunMetrics } from "@/components/run-metrics";
import type { Coverage } from "@/lib/review/coverage";
import type { PipelineStep } from "@/lib/runs/pipeline-steps";

export function Sidebar({
  documents,
  uploading,
  error,
  selectedId,
  onSelect,
  resumingId,
  onResume,
  steps,
  coverage,
  costUsd,
}: {
  documents: DocumentSummary[];
  uploading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resumingId: string | null;
  onResume: (id: string) => void;
  steps: PipelineStep[];
  coverage: Coverage;
  costUsd: number;
}) {
  return (
    <aside className="w-72 shrink-0 space-y-6 overflow-y-auto border-r bg-sidebar p-4">
      <DocumentList
        documents={documents}
        uploading={uploading}
        error={error}
        selectedId={selectedId}
        onSelect={onSelect}
        resumingId={resumingId}
        onResume={onResume}
      />
      <AgentSteps steps={steps} />
      <RunMetrics coverage={coverage} costUsd={costUsd} />
    </aside>
  );
}
