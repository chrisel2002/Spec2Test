import { HomeClient } from "@/components/home-client";
import { listDocumentSummaries } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const documents = await listDocumentSummaries();
  return <HomeClient initialDocuments={documents} />;
}
