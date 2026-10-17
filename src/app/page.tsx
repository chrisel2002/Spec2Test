import { HomeClient } from "@/components/home-client";
import { loadRunDetail } from "@/lib/agents/runner";
import {
  getLatestRunId,
  listDocumentSummaries,
  listRunsForDocument,
} from "@/lib/db/queries";
import { isVoiceEnabled } from "@/lib/voice/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const documents = await listDocumentSummaries();
  const selectedDocumentId = documents[0]?.id ?? null;
  const latestRunId = selectedDocumentId
    ? await getLatestRunId(selectedDocumentId)
    : null;
  const [runs, runDetail] = await Promise.all([
    selectedDocumentId ? listRunsForDocument(selectedDocumentId) : [],
    latestRunId ? loadRunDetail(latestRunId) : null,
  ]);

  return (
    <HomeClient
      initialDocuments={documents}
      initialSelectedDocumentId={selectedDocumentId}
      initialRuns={runs}
      initialRunDetail={runDetail}
      // Decided on the server, where the env var lives; the client only
      // learns a boolean, never the key.
      voiceEnabled={isVoiceEnabled()}
    />
  );
}
