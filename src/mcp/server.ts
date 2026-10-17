import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { latestSteps } from "@/lib/runs/selectors";
import type { RunDetail } from "@/lib/runs/types";
import { ingestSpec, listDocuments } from "@/lib/services/documents";
import { ServiceError } from "@/lib/services/errors";
import { getPlaywrightFiles } from "@/lib/services/exports";
import { getRequirements, getTraceabilityMatrix } from "@/lib/services/matrix";
import { getRun, reviewUrl, type Schedule, startRun } from "@/lib/services/runs";

// The MCP server is a second interface to the same service layer the web
// app's API routes use: each tool validates its input with Zod, calls one
// or two service functions, and formats the result as JSON text for the
// agent. No business logic lives here.
//
// Human review is deliberately not exposed. There is no tool to approve,
// edit, or reject tests, resolve ambiguity, or build the matrix: those
// decisions are what make the traceability matrix trustworthy, so they
// stay with a person in the web app. The instructions and tool
// descriptions say so, so an agent understands why it has to wait.

const HUMAN_REVIEW_NOTE =
  "Spec2Test keeps a human in the loop on purpose: after generating tests, a run pauses " +
  "with status waiting_for_review until a person approves, edits, or rejects the tests " +
  "in the Spec2Test web app and clicks Build matrix. This server cannot approve tests or " +
  "resume a run, by design: coverage only counts tests a human signed off, so an agent " +
  "approving its own tests would make the matrix meaningless. When a run is waiting for " +
  "review, give the user the reviewUrl and wait.";

const INSTRUCTIONS = `Spec2Test turns a software requirements spec into atomic requirements, flags ambiguous ones, drafts Given/When/Then test cases, and builds a requirements-to-tests traceability matrix.

Typical flow: list_documents or ingest_spec -> start_run -> poll get_run_status every few seconds while status is "running" -> get_requirements to see ambiguity flags -> (a human reviews in the web app) -> get_traceability_matrix and export_playwright_tests once the run is "completed".

${HUMAN_REVIEW_NOTE}`;

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

// Expected failures (bad id, run not finished, ...) go back to the agent
// as a tool error with the service's message, which says what to do.
// Anything unexpected is logged to stderr (stdout carries the protocol)
// and reported without internals.
async function handle(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return json(await action());
  } catch (error) {
    const message =
      error instanceof ServiceError ? error.message : "Spec2Test hit an unexpected error.";
    if (!(error instanceof ServiceError)) console.error("[spec2test-mcp]", error);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

const NEXT_ACTION: Record<RunDetail["run"]["status"], (runId: string) => string> = {
  running: () =>
    "The agent is still working. Call get_run_status again in a few seconds.",
  waiting_for_review: (runId) =>
    `Waiting for human review. Ask the user to review the test cases at ${reviewUrl(runId)} ` +
    "and click Build matrix there. You cannot approve tests or build the matrix yourself. " +
    "Meanwhile you can call get_requirements to discuss ambiguous requirements with the user.",
  completed: () =>
    "Done. Call get_traceability_matrix for coverage and gaps, or export_playwright_tests " +
    "to write test skeletons for the approved tests.",
  failed: (runId) =>
    `The run failed. The user can retry it from the web app at ${reviewUrl(runId)}, or you ` +
    "can start a new run.",
};

function runStatus(detail: RunDetail) {
  const { run } = detail;
  const steps = latestSteps(detail.steps);
  return {
    runId: run.id,
    documentId: run.documentId,
    status: run.status,
    humanReviewRequired: run.status === "waiting_for_review",
    reviewUrl: reviewUrl(run.id),
    nextAction: NEXT_ACTION[run.status](run.id),
    error: run.error,
    rateLimited: run.rateLimited,
    steps: Object.fromEntries(Object.entries(steps).map(([name, step]) => [name, step.status])),
    counts: {
      requirements: detail.requirements.length,
      ambiguous: detail.requirements.filter((r) => r.isAmbiguous && !r.ambiguityResolved).length,
      testCases: detail.testCases.length,
      approved: detail.testCases.filter((tc) => tc.status === "approved").length,
    },
    signedOffCoverage: run.coverage,
  };
}

const runId = z.string().describe("Run id (a UUID), as returned by start_run.");

const fireAndForget: Schedule = (task) => {
  task().catch((error) => console.error("[spec2test-mcp] run failed", error));
};

export function createSpec2TestServer({ schedule = fireAndForget }: { schedule?: Schedule } = {}) {
  const server = new McpServer(
    { name: "spec2test", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        "List the requirement specs uploaded to Spec2Test, with their ids and embedding status. " +
        'A document must have status "ready" before start_run can use it.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => handle(async () => ({ documents: await listDocuments() })),
  );

  server.registerTool(
    "ingest_spec",
    {
      title: "Ingest a spec",
      description:
        "Upload a requirements spec to Spec2Test: either a .md or .pdf file by path, or Markdown " +
        "text directly. It is parsed, chunked, and embedded. Re-ingesting identical content " +
        "returns the existing document instead of a duplicate. Returns the documentId to pass " +
        "to start_run. Only use synthetic or public documents.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Path to a .md or .pdf file. Relative paths resolve from the server's working " +
              "directory; prefer absolute paths.",
          ),
        markdown: z.string().optional().describe("Markdown text of the spec, instead of a path."),
        filename: z
          .string()
          .optional()
          .describe('Name for a Markdown-text spec, ending in .md. Defaults to "spec.md".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ path: filePath, markdown, filename }) =>
      handle(async () => {
        if (Boolean(filePath) === Boolean(markdown)) {
          throw new ServiceError("Pass exactly one of path or markdown.", "invalid");
        }
        const input = filePath
          ? {
              filename: path.basename(filePath),
              data: await readFile(path.resolve(filePath)).catch(() => {
                throw new ServiceError(`Couldn't read the file ${filePath}.`, "invalid");
              }),
            }
          : { filename: filename ?? "spec.md", data: Buffer.from(markdown ?? "", "utf8") };
        return ingestSpec(input);
      }),
  );

  server.registerTool(
    "start_run",
    {
      title: "Start a run",
      description:
        "Start the Spec2Test agent on a ready document: it extracts requirements, checks them " +
        "for ambiguity, and drafts test cases. Returns immediately with a runId; the run takes " +
        "from seconds to a few minutes, so poll get_run_status. The run then pauses for human " +
        `review. ${HUMAN_REVIEW_NOTE}`,
      inputSchema: { documentId: z.string().describe("Document id from list_documents or ingest_spec.") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ documentId }) =>
      handle(async () => {
        const run = await startRun(documentId, schedule);
        return {
          runId: run.id,
          status: run.status,
          reviewUrl: reviewUrl(run.id),
          nextAction: NEXT_ACTION.running(run.id),
        };
      }),
  );

  server.registerTool(
    "get_run_status",
    {
      title: "Get run status",
      description:
        "Status of a run: running, waiting_for_review, completed, or failed, with per-step " +
        "status, counts, and nextAction telling you what to do next. When the status is " +
        "waiting_for_review, humanReviewRequired is true and reviewUrl is the page where a " +
        `person reviews the tests. ${HUMAN_REVIEW_NOTE}`,
      inputSchema: { runId },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ runId: id }) => handle(async () => runStatus(await getRun(id))),
  );

  server.registerTool(
    "get_requirements",
    {
      title: "Get requirements",
      description:
        "The requirements extracted in a run, each with its code (REQ-01...), text, whether it " +
        "is ambiguous and why, the suggested measurable rewrite, whether a reviewer resolved " +
        "it, and test counts by review status. Available as soon as extraction has run.",
      inputSchema: {
        runId,
        ambiguousOnly: z
          .boolean()
          .optional()
          .describe("Only return ambiguous requirements that nobody has resolved yet."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ runId: id, ambiguousOnly }) =>
      handle(async () => {
        const { run, requirements } = await getRequirements(id);
        return {
          runId: run.id,
          status: run.status,
          requirements: requirements
            .filter((r) => !ambiguousOnly || !r.testable)
            .map((r) => ({
              code: r.code,
              title: r.title,
              text: r.text,
              ambiguous: r.isAmbiguous,
              ambiguityReason: r.ambiguityReason,
              suggestedRewrite: r.suggestedRewrite,
              resolvedByReviewer: r.ambiguityResolved,
              originalText: r.originalText,
              tests: r.tests,
            })),
        };
      }),
  );

  server.registerTool(
    "get_traceability_matrix",
    {
      title: "Get traceability matrix",
      description:
        "The traceability matrix of a run: each requirement with its linked test cases (title, " +
        "type, review status), coverage (testable requirements with at least one human-approved " +
        "test), and gaps (no approved tests, or an ambiguity nobody resolved). Final once the " +
        "run is completed; while it waits for review it is a preview.",
      inputSchema: {
        runId,
        gapsOnly: z.boolean().optional().describe("Only return requirements that are gaps."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ runId: id, gapsOnly }) =>
      handle(async () => {
        const matrix = await getTraceabilityMatrix(id, { status: "all", gapsOnly: gapsOnly ?? false });
        return {
          runId: matrix.run.id,
          status: matrix.run.status,
          final: matrix.run.status === "completed",
          coverage: matrix.coverage,
          gaps: matrix.gaps,
          rows: matrix.rows.map(({ requirement, testCases, gap }) => ({
            requirement: requirement.code,
            title: requirement.title,
            gap,
            testCases: testCases.map((tc) => ({
              title: tc.title,
              type: tc.type,
              status: tc.status,
            })),
          })),
        };
      }),
  );

  server.registerTool(
    "export_playwright_tests",
    {
      title: "Export Playwright tests",
      description:
        "Write Playwright test skeletons for a completed run into a folder: one .spec.ts per " +
        "requirement with approved tests, a test.fixme per approved test with its " +
        "Given/When/Then as comments. Only works once a human has reviewed the run and built " +
        "the matrix, and only approved tests are exported. Existing files with the same names " +
        "are overwritten.",
      inputSchema: {
        runId,
        outputDir: z
          .string()
          .describe("Folder to write the .spec.ts files into; created if missing. Prefer an absolute path."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ runId: id, outputDir }) =>
      handle(async () => {
        const { files } = await getPlaywrightFiles(id);
        const dir = path.resolve(outputDir);
        await mkdir(dir, { recursive: true });
        const written = [];
        for (const file of files) {
          const target = path.join(dir, file.path);
          await writeFile(target, file.content, "utf8");
          written.push(target);
        }
        return { outputDir: dir, files: written };
      }),
  );

  return server;
}
