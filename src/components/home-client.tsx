"use client";

import {
  Clock,
  FileText,
  FileUp,
  Loader2,
  Play,
  SearchX,
  Sparkles,
  Table2,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { ChatWithSpec } from "@/components/chat-with-spec";
import type { DocumentSummary } from "@/components/document-list";
import { EmptyState } from "@/components/empty-state";
import { RequirementsReview } from "@/components/review/requirements-review";
import { RunBanner } from "@/components/run-banner";
import { RunPicker } from "@/components/run-picker";
import { RunToolbar } from "@/components/run-toolbar";
import { Sidebar } from "@/components/sidebar";
import { TraceabilityMatrix } from "@/components/traceability-matrix";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useReviewerName } from "@/hooks/use-reviewer-name";
import { useRun } from "@/hooks/use-run";
import { calculateCoverage } from "@/lib/review/coverage";
import { derivePipelineSteps } from "@/lib/runs/pipeline-steps";
import { totalCostUsd } from "@/lib/runs/selectors";
import type { RunDetail, RunSummary } from "@/lib/runs/types";

function DocumentNotReady({ document }: { document: DocumentSummary }) {
  switch (document.status) {
    case "embedding":
      return (
        <EmptyState
          icon={Loader2}
          title="Embedding the document…"
          description={`${document.embeddedCount} of ${document.chunkCount} chunks embedded. The agent can run once this finishes.`}
        />
      );
    case "waiting":
      return (
        <EmptyState
          icon={Clock}
          title="Embedding is paused"
          description={`${document.statusMessage ?? "The embedding quota ran out."} Use "Resume embedding" in the sidebar once it resets.`}
        />
      );
    default:
      return (
        <EmptyState
          icon={XCircle}
          title="Embedding failed"
          description={`${document.statusMessage ?? "Something went wrong."} Use "Resume embedding" in the sidebar to try again.`}
        />
      );
  }
}

function emptyDetail(run: RunSummary): RunDetail {
  return { run, steps: [], requirements: [], testCases: [], reviewEvents: [] };
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
  const [reviewer, setReviewer] = useReviewerName();
  const [starting, setStarting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // "Latest request wins" for switching what's on screen. Every switch
  // takes a new number; a slow fetch that comes back after a newer switch
  // (say, the user clicked "New run" while the document's last run was
  // still loading) sees its number is stale and drops its result instead
  // of overwriting the newer view.
  const viewRequest = useRef(0);

  const running = run.detail?.run.status === "running";
  const selectedDocument =
    documents.find((doc) => doc.id === selectedDocumentId) ?? null;
  const steps = derivePipelineSteps(selectedDocument, run.detail, run.progress);
  const coverage = calculateCoverage(
    run.detail?.requirements ?? [],
    run.detail?.testCases ?? [],
  );
  const costUsd = totalCostUsd(run.detail?.steps ?? []);
  // The list is fetched once per document; the open run's status changes
  // live, so it's taken from the run itself.
  const runHistory = runs.map((r) =>
    r.id === run.detail?.run.id ? run.detail.run : r,
  );

  // Shows a run and records it in the URL (?run=<id>), so a refresh, a
  // bookmark, or a shared link reopens this exact run. replaceState
  // rather than a router navigation: the page already has the data, and
  // a navigation would re-render the server component for nothing.
  function showRun(detail: RunDetail | null) {
    run.load(detail);
    const url = new URL(window.location.href);
    if (detail) url.searchParams.set("run", detail.run.id);
    else url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
  }

  async function handleSelectRun(runId: string) {
    const request = ++viewRequest.current;
    setStartError(null);
    const response = await fetch(`/api/runs/${runId}`);
    if (request !== viewRequest.current) return;
    if (!response.ok) {
      setStartError("Couldn't load that run");
      return;
    }
    showRun(await response.json());
  }

  // Event-driven, not an effect: called directly from the upload/select
  // handlers below, each a response to a user action rather than a
  // reactive sync-on-mount.
  async function loadLatestRunFor(documentId: string) {
    const request = ++viewRequest.current;
    const runsResponse = await fetch(`/api/documents/${documentId}/runs`);
    const runList: RunSummary[] = runsResponse.ok
      ? await runsResponse.json()
      : [];
    if (request !== viewRequest.current) return;
    setRuns(runList);

    const latest = runList[0];
    if (!latest) {
      showRun(null);
      return;
    }
    const detailResponse = await fetch(`/api/runs/${latest.id}`);
    const detail = detailResponse.ok ? await detailResponse.json() : null;
    if (request !== viewRequest.current) return;
    showRun(detail);
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
    // Supersedes any run that's still loading for this document.
    ++viewRequest.current;
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
      showRun(emptyDetail(newRun));
    } finally {
      setStarting(false);
    }
  }

  // Build matrix (resume) and Retry both continue the graph from its
  // checkpoint. On success the run flips to "running" locally, which is
  // what makes useRun reopen the event stream.
  async function continueRun(path: "resume" | "retry") {
    const current = run.detail?.run;
    if (!current) return;
    setContinuing(true);
    setStartError(null);

    try {
      const response = await fetch(`/api/runs/${current.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: reviewer }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        setStartError(body.error ?? "Couldn't continue the run");
        return;
      }
      run.apply({
        type: "run",
        run: { ...current, status: "running", error: null, rateLimited: false },
      });
    } finally {
      setContinuing(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        onUpload={handleUpload}
        uploading={uploading}
        reviewer={reviewer}
        onReviewerChange={setReviewer}
      />
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
          {selectedDocument ? (
            <Tabs defaultValue="requirements" className="mx-auto max-w-5xl">
              <div className="mb-4 space-y-3">
                <RunToolbar
                  run={run.detail?.run ?? null}
                  canStart={selectedDocument.status === "ready" && !running}
                  starting={starting}
                  onStart={handleStartRun}
                  continuing={continuing}
                  onBuildMatrix={() => continueRun("resume")}
                >
                  <h1 className="truncate text-lg font-semibold">
                    {selectedDocument.filename}
                  </h1>
                  <RunPicker
                    runs={runHistory}
                    selectedId={run.detail?.run.id ?? null}
                    disabled={starting || continuing}
                    onSelect={handleSelectRun}
                  />
                </RunToolbar>
                {startError && (
                  <p role="alert" className="text-sm text-destructive">
                    {startError}
                  </p>
                )}
                {run.detail && (
                  <RunBanner
                    detail={run.detail}
                    steps={steps}
                    connection={run.connection}
                    continuing={continuing}
                    onRetry={() => continueRun("retry")}
                  />
                )}
              </div>
              <TabsList>
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="traceability">
                  Traceability matrix
                </TabsTrigger>
                <TabsTrigger value="chat">Chat with spec</TabsTrigger>
              </TabsList>
              <TabsContent value="requirements" className="mt-4">
                {selectedDocument.status !== "ready" ? (
                  <DocumentNotReady document={selectedDocument} />
                ) : !run.detail ? (
                  <EmptyState
                    icon={Sparkles}
                    title="Ready to analyze"
                    description="Run the agent to extract atomic requirements, flag ambiguous ones, and draft Given/When/Then tests for you to review."
                    action={
                      <Button onClick={handleStartRun} disabled={starting}>
                        <Play aria-hidden />
                        Run agent
                      </Button>
                    }
                  />
                ) : run.detail.requirements.length === 0 && !running ? (
                  <EmptyState
                    icon={SearchX}
                    title={
                      run.detail.run.status === "completed"
                        ? "No requirements found"
                        : "No requirements yet"
                    }
                    description={
                      run.detail.run.status === "completed"
                        ? "The agent found no requirement statements (shall, must, should) in this document, so there is nothing to review."
                        : "The run stopped before any requirements were extracted."
                    }
                  />
                ) : (
                  <RequirementsReview
                    detail={run.detail}
                    extracting={steps[1].state === "running" || (running && run.detail.steps.length === 0)}
                    actor={reviewer}
                    voiceEnabled={voiceEnabled}
                    apply={run.apply}
                    load={run.load}
                  />
                )}
              </TabsContent>
              <TabsContent value="traceability" className="mt-4">
                {run.detail && !running && run.detail.requirements.length > 0 ? (
                  <TraceabilityMatrix detail={run.detail} />
                ) : (
                  <EmptyState
                    icon={running ? Loader2 : Table2}
                    title={running ? "The matrix comes after review" : "No matrix yet"}
                    description={
                      running
                        ? "The agent is still working. Once it has generated tests, you can review them and the matrix will appear here."
                        : "Run the agent on this document to map its requirements to test cases."
                    }
                  />
                )}
              </TabsContent>
              <TabsContent value="chat" className="mt-4 h-[calc(100%-3rem)]">
                <ChatWithSpec voiceEnabled={voiceEnabled} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="mx-auto mt-10 max-w-2xl">
              <EmptyState
                icon={FileText}
                title={uploading ? "Processing your spec…" : "Upload a requirements spec"}
                description="Markdown or PDF, up to 10 MB. Only use synthetic or public documents; sample-specs/ has two to try."
                action={
                  <label
                    htmlFor="spec-upload"
                    className={buttonVariants({ size: "lg" })}
                    aria-disabled={uploading}
                  >
                    <FileUp aria-hidden />
                    Choose a file
                  </label>
                }
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
