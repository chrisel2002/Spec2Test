import { AccessProvider } from "@/components/access-provider";
import { HomeClient } from "@/components/home-client";
import { accessState } from "@/lib/services/access";
import { listDocuments } from "@/lib/services/documents";
import { ServiceError } from "@/lib/services/errors";
import { getLatestRun, getRun, listRuns } from "@/lib/services/runs";
import { isVoiceEnabled } from "@/lib/voice/config";

export const dynamic = "force-dynamic";

// A stale or mistyped ?run= link falls back to the default view instead of
// an error page.
async function getRunIfExists(runId: string | undefined) {
  if (!runId) return null;
  try {
    return await getRun(runId);
  } catch (error) {
    if (error instanceof ServiceError) return null;
    throw error;
  }
}

// ?run=<id> opens that run (and its document); without it, the newest
// document's latest run. Rendering from the DB on the server is what makes
// a run survive a page refresh — including one still running, whose
// event stream the client then reopens.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { run } = await searchParams;
  const documents = await listDocuments();

  let runDetail = await getRunIfExists(typeof run === "string" ? run : undefined);
  const selectedDocumentId = runDetail?.run.documentId ?? documents[0]?.id ?? null;
  if (!runDetail && selectedDocumentId) {
    runDetail = await getLatestRun(selectedDocumentId);
  }
  const runs = selectedDocumentId ? await listRuns(selectedDocumentId) : [];
  const access = await accessState();

  return (
    <AccessProvider initialLocked={access.locked} message={access.message}>
      <HomeClient
        initialDocuments={documents}
        initialSelectedDocumentId={selectedDocumentId}
        initialRuns={runs}
        initialRunDetail={runDetail}
        // Decided on the server, where the env var lives; the client only
        // learns a boolean, never the key.
        voiceEnabled={isVoiceEnabled()}
      />
    </AccessProvider>
  );
}
