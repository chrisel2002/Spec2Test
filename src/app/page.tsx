import { HomeClient } from "@/components/home-client";
import { listDocumentSummaries, listRequirementsWithTestCases } from "@/lib/db/queries";
import { isVoiceEnabled } from "@/lib/voice/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const documents = await listDocumentSummaries();
  const selectedDocumentId = documents[0]?.id ?? null;
  const requirements = selectedDocumentId
    ? await listRequirementsWithTestCases(selectedDocumentId)
    : [];

  return (
    <HomeClient
      initialDocuments={documents}
      initialSelectedDocumentId={selectedDocumentId}
      initialRequirements={requirements}
      // Decided on the server, where the env var lives; the client only
      // learns a boolean, never the key.
      voiceEnabled={isVoiceEnabled()}
    />
  );
}
