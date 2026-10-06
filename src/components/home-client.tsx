"use client";

import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { ChatWithSpec } from "@/components/chat-with-spec";
import type { DocumentSummary } from "@/components/document-list";
import { RequirementsPanel, type RequirementRow } from "@/components/requirements-panel";
import { Sidebar } from "@/components/sidebar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export function HomeClient({
  initialDocuments,
  initialSelectedDocumentId,
  initialRequirements,
}: {
  initialDocuments: DocumentSummary[];
  initialSelectedDocumentId: string | null;
  initialRequirements: RequirementRow[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedDocumentId, setSelectedDocumentId] = useState(
    initialSelectedDocumentId,
  );
  const [requirements, setRequirements] = useState(initialRequirements);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Event-driven, not an effect: called directly from the upload/select/
  // generate handlers below, each a response to a user action rather than
  // a reactive sync-on-mount.
  async function loadRequirementsFor(documentId: string) {
    const response = await fetch(`/api/documents/${documentId}/run`);
    if (response.ok) {
      const body = await response.json();
      setRequirements(body.requirements);
    }
  }

  async function handleSelectDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setGenerateError(null);
    await loadRequirementsFor(documentId);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadResponse = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const uploadBody = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadBody.error ?? "Upload failed");
      }

      const listResponse = await fetch("/api/documents");
      if (listResponse.ok) {
        setDocuments(await listResponse.json());
      }

      await handleSelectDocument(uploadBody.documentId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateTests() {
    if (!selectedDocumentId) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch(
        `/api/documents/${selectedDocumentId}/run`,
        { method: "POST" },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Run failed");
      }
      if (body.stopReason) {
        throw new Error(body.stopReason);
      }

      await loadRequirementsFor(selectedDocumentId);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader onUpload={handleUpload} uploading={uploading} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          documents={documents}
          uploading={uploading}
          error={uploadError}
          selectedId={selectedDocumentId}
          onSelect={handleSelectDocument}
        />
        <main className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="requirements">
            <TabsList>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="traceability">
                Traceability matrix
              </TabsTrigger>
              <TabsTrigger value="chat">Chat with spec</TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="mt-4">
              <RequirementsPanel
                hasDocument={selectedDocumentId !== null}
                requirements={requirements}
                generating={generating}
                error={generateError}
                onGenerate={handleGenerateTests}
              />
            </TabsContent>
            <TabsContent value="traceability" className="mt-4">
              <p className="text-sm text-muted-foreground">
                The traceability matrix will map requirements to their
                generated test cases.
              </p>
            </TabsContent>
            <TabsContent value="chat" className="mt-4 h-[calc(100%-3rem)]">
              <ChatWithSpec />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
