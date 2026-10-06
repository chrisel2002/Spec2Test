import { HomeClient } from "@/components/home-client";
import { listDocumentSummaries, listRequirementsWithTestCases } from "@/lib/db/queries";

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
    />
  );
}
