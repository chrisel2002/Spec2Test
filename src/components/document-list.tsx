import { Badge } from "@/components/ui/badge";

export type DocumentSummary = {
  id: string;
  filename: string;
  chunkCount: number;
};

export function DocumentList({
  documents,
  uploading,
  error,
}: {
  documents: DocumentSummary[];
  uploading: boolean;
  error: string | null;
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
          <li
            key={doc.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="truncate" title={doc.filename}>
              {doc.filename}
            </span>
            <Badge variant="outline">{doc.chunkCount} chunks</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
