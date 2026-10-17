import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { documents } from "@/lib/db/schema";
import { cn } from "cn";

export type DocumentSummary = {
  id: string;
  filename: string;
  // Type-only import: inferred from the Drizzle enum, erased at build time,
  // so no server code reaches the client bundle.
  status: (typeof documents.$inferSelect)["status"];
  statusMessage: string | null;
  chunkCount: number;
  embeddedCount: number;
};

function StatusBadge({ doc }: { doc: DocumentSummary }) {
  switch (doc.status) {
    case "ready":
      return <Badge variant="outline">{doc.chunkCount} chunks</Badge>;
    case "embedding":
      return <Badge variant="outline">Embedding…</Badge>;
    case "waiting":
      return <Badge variant="secondary">Waiting</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
}

export function DocumentList({
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
    <section>
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
              <StatusBadge doc={doc} />
            </button>
            {(doc.status === "waiting" || doc.status === "failed") && (
              <div className="mt-1 space-y-1 px-1">
                {doc.statusMessage && (
                  <p className="text-xs text-muted-foreground">
                    {doc.statusMessage}
                  </p>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => onResume(doc.id)}
                  disabled={resumingId !== null}
                >
                  {resumingId === doc.id ? "Resuming…" : "Resume embedding"}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
