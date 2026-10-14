import { AgentSteps } from "@/components/agent-steps";
import { DocumentList, type DocumentSummary } from "@/components/document-list";

export function Sidebar({
  documents,
  uploading,
  error,
  selectedId,
  onSelect,
  resumingId,
  onResume,
}: {
  documents: DocumentSummary[];
  uploading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resumingId: string | null;
  onResume: (id: string) => void;
}) {
  return (
    <aside className="w-56 shrink-0 space-y-6 border-r p-4">
      <DocumentList
        documents={documents}
        uploading={uploading}
        error={error}
        selectedId={selectedId}
        onSelect={onSelect}
        resumingId={resumingId}
        onResume={onResume}
      />
      <AgentSteps />
    </aside>
  );
}
