import { AgentSteps } from "@/components/agent-steps";
import { DocumentList, type DocumentSummary } from "@/components/document-list";

export function Sidebar({
  documents,
  uploading,
  error,
  selectedId,
  onSelect,
}: {
  documents: DocumentSummary[];
  uploading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="w-56 shrink-0 space-y-6 border-r p-4">
      <DocumentList
        documents={documents}
        uploading={uploading}
        error={error}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <AgentSteps />
    </aside>
  );
}
