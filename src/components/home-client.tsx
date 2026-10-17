"use client";

import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { ChatWithSpec } from "@/components/chat-with-spec";
import type { DocumentSummary } from "@/components/document-list";
import { RequirementsPanel } from "@/components/requirements-panel";
import { RunToolbar } from "@/components/run-toolbar";
import { Sidebar } from "@/components/sidebar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useRun } from "@/hooks/use-run";
import { calculateCoverage } from "@/lib/review/coverage";
import { derivePipelineSteps } from "@/lib/runs/pipeline-steps";
import { totalCostUsd } from "@/lib/runs/selectors";
import type { RunDetail, RunSummary } from "@/lib/runs/types";

function emptyDetail(run: RunSummary): RunDetail {
  return { run, steps: [], requirements: [], testCases: [] };
}

export function HomeClient({
  initialDocuments,
  initialSelectedDocumentId,
  initialRuns,
  initialRunDetail,
  voiceEnabled,
}: {
  initialDocuments: DocumentSummary[];
  initialSelectedDocumentId: string | null;
  initialRuns: RunSummary[];
  initialRunDetail: RunDetail | null;
  voiceEnabled: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const [selectedDocumentId, setSelectedDocumentId] = useState(
    initialSelectedDocumentId,
  );
  const [runs, setRuns] = useState(initialRuns);
  const run = useRun(initialRunDetail);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const running = run.detail?.run.status === "running";
  const selectedDocument =
    documents.find((doc) => doc.id === selectedDocumentId) ?? null;
  const steps = derivePipelineSteps(selectedDocument, run.detail, run.progress);
  const coverage = calculateCoverage(
    run.detail?.requirements ?? [],
    run.detail?.testCases ?? [],
  );
  const costUsd = totalCostUsd(run.detail?.steps ?? []);

  // Event-driven, not an effect: called directly from the upload/select
  // handlers below, each a response to a user action rather than a
  // reactive sync-on-mount.
  async function loadLatestRunFor(documentId: string) {
    const runsResponse = await fetch(`/api/documents/${documentId}/runs`);
    const runList: RunSummary[] = runsResponse.ok
      ? await runsResponse.json()
      : [];
    setRuns(runList);

    const latest = runList[0];
    if (!latest) {
      run.load(null);
      return;
    }
    const detailResponse = await fetch(`/api/runs/${latest.id}`);
    run.load(detailResponse.ok ? await detailResponse.json() : null);
  }

  // The sidebar shows each document's status and message, so after any
  // ingest/resume the list is simply re-fetched rather than patched.
  async function refreshDocuments() {
    const listResponse = await fetch("/api/documents");
    if (listResponse.ok) {
      setDocuments(await listResponse.json());
    }
  }

  async function handleResume(documentId: string) {
    setResumingId(documentId);
    try {
      await fetch(`/api/documents/${documentId}/embed`, { method: "POST" });
    } finally {
      await refreshDocuments();
      setResumingId(null);
    }
  }

  async function handleSelectDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setStartError(null);
    await loadLatestRunFor(documentId);
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

      await refreshDocuments();
      await handleSelectDocument(uploadBody.documentId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Starting a run only creates it; loading its (empty) detail with status
  // "running" is what makes useRun open the event stream.
  async function handleStartRun() {
    if (!selectedDocumentId) return;
    setStarting(true);
    setStartError(null);

    try {
      const response = await fetch(`/api/documents/${selectedDocumentId}/runs`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setStartError(body.error ?? "Couldn't start the run");
        return;
      }

      const newRun: RunSummary = body;
      setRuns((previous) => [newRun, ...previous]);
      run.load(emptyDetail(newRun));
    } finally {
      setStarting(false);
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
          resumingId={resumingId}
          onResume={handleResume}
          steps={steps}
          coverage={coverage}
          costUsd={costUsd}
        />
        <main className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="requirements" className="mx-auto max-w-5xl">
            {selectedDocument && (
              <div className="mb-4 space-y-2">
                <RunToolbar
                  run={run.detail?.run ?? null}
                  canStart={selectedDocument.status === "ready" && !running}
                  starting={starting}
                  onStart={handleStartRun}
                >
                  <h1 className="truncate text-lg font-semibold">
                    {selectedDocument.filename}
                  </h1>
                </RunToolbar>
                {startError && <p className="text-sm text-destructive">{startError}</p>}
              </div>
            )}
            <TabsList>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="traceability">
                Traceability matrix
              </TabsTrigger>
              <TabsTrigger value="chat">Chat with spec</TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="mt-4">
              {run.detail ? (
                <RequirementsPanel
                  runId={run.detail.run.id}
                  requirements={run.detail.requirements}
                  testCases={run.detail.testCases}
                  extracting={steps[1].state === "running" || (running && run.detail.steps.length === 0)}
                  voiceEnabled={voiceEnabled}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selectedDocument
                    ? "No runs yet. Click “Run agent” to extract requirements and generate tests."
                    : "Upload a spec to get started."}
                </p>
              )}
            </TabsContent>
            <TabsContent value="traceability" className="mt-4">
              <p className="text-sm text-muted-foreground">
                The traceability matrix will map requirements to their
                generated test cases ({runs.length} runs so far).
              </p>
            </TabsContent>
            <TabsContent value="chat" className="mt-4 h-[calc(100%-3rem)]">
              <ChatWithSpec voiceEnabled={voiceEnabled} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
