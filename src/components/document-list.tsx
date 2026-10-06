import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

export type DocumentSummary = {
  id: string;
  filename: string;
  chunkCount: number;
};

export function DocumentList({
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
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Documents
      </h2>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <ul className="space-y-2">
        {uploading && (
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">
              Processing…
            </span>
            <Badge variant="outline">Uploading</Badge>
          </li>
        )}
        {documents.length === 0 && !uploading && (
          <li className="text-sm text-muted-foreground">
            No documents yet
          </li>
        )}
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onSelect(doc.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted",
                doc.id === selectedId && "bg-muted font-medium",
              )}
            >
              <span className="truncate" title={doc.filename}>
                {doc.filename}
              </span>
              <Badge variant="outline">{doc.chunkCount} chunks</Badge>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
