import { z } from "zod";

import { HomeClient } from "@/components/home-client";
import { loadRunDetail } from "@/lib/agents/runner";
import {
  getLatestRunId,
  listDocumentSummaries,
  listRunsForDocument,
} from "@/lib/db/queries";
import { isVoiceEnabled } from "@/lib/voice/config";

export const dynamic = "force-dynamic";

// ?run=<id> opens that run (and its document); without it, the newest
// document's latest run. Rendering from the DB on the server is what makes
// a run survive a page refresh — including one still running, whose
// event stream the client then reopens.
export default async function Home({ searchParams }: PageProps<"/">) {
  const requestedRun = z.uuid().safeParse((await searchParams).run);
  const documents = await listDocumentSummaries();

  let runDetail = requestedRun.success
    ? await loadRunDetail(requestedRun.data)
    : null;
  const selectedDocumentId = runDetail?.run.documentId ?? documents[0]?.id ?? null;

  if (!runDetail && selectedDocumentId) {
    const latestRunId = await getLatestRunId(selectedDocumentId);
    runDetail = latestRunId ? await loadRunDetail(latestRunId) : null;
  }
  const runs = selectedDocumentId
    ? await listRunsForDocument(selectedDocumentId)
    : [];

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
