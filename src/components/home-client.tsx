"use client";

import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { ChatWithSpec } from "@/components/chat-with-spec";
import type { DocumentSummary } from "@/components/document-list";
import { Sidebar } from "@/components/sidebar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export function HomeClient({
  initialDocuments,
}: {
  initialDocuments: DocumentSummary[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader onUpload={handleUpload} uploading={uploading} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar documents={documents} uploading={uploading} error={error} />
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
              <p className="text-sm text-muted-foreground">
                Extracted requirements will show up here once a spec has been
                uploaded.
              </p>
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
