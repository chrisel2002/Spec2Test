import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSpec2TestServer } from "@/mcp/server";
import { reviewTestCase } from "@/lib/services/review";
import { getRun, resumeRun, type Schedule } from "@/lib/services/runs";

// The MCP server end to end, in-process: a real MCP client talks to the
// real server over an in-memory transport (the same protocol messages as
// stdio, without a child process), and the tools run the real service
// layer and agent graph against Postgres, with the model mocked.

const SPEC = `# Newsletter signup

## Signup form

The system shall let a visitor subscribe with an email address.

## Confirmation

The system shall send a confirmation email after a visitor subscribes.

## Performance

The signup page should feel fast.
`;

// Runs scheduled by the tools are collected so the test can wait for them
// at the end instead of leaving them running.
const pending: Promise<void>[] = [];
const schedule: Schedule = (task) => {
  pending.push(task());
};

let client: Client;
let documentId: string;
let runId: string;

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[] };

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content[0]?.text ?? "";
  return { isError: result.isError ?? false, text, json: () => JSON.parse(text) };
}

async function waitForStatus(status: string) {
  for (let i = 0; i < 100; i++) {
    const run = (await call("get_run_status", { runId })).json();
    if (run.status === status) return run;
    if (run.status === "failed") throw new Error(`Run failed: ${run.error}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Run never reached ${status}`);
}

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createSpec2TestServer({ schedule }).connect(serverTransport);
  client = new Client({ name: "spec2test-test", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await Promise.allSettled(pending);
  await client?.close();
});

describe("Spec2Test MCP server", () => {
  it("exposes the core actions and no way to approve tests or build the matrix", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "export_playwright_tests",
      "get_requirements",
      "get_run_status",
      "get_traceability_matrix",
      "ingest_spec",
      "list_documents",
      "start_run",
    ]);
    expect(tools.some((t) => /approve|reject|review|resume|build/.test(t.name))).toBe(false);
    // The agent is told why, both up front and where it matters.
    expect(client.getInstructions()).toMatch(/cannot approve tests/);
    expect(tools.find((t) => t.name === "get_run_status")?.description).toMatch(
      /waiting_for_review/,
    );
  });

  it("ingests Markdown text and lists it", async () => {
    const ingested = await call("ingest_spec", { markdown: SPEC, filename: "newsletter.md" });
    expect(ingested.isError).toBe(false);
    documentId = ingested.json().documentId;
    expect(ingested.json()).toMatchObject({ status: "ready", alreadyExists: false });

    const { documents } = (await call("list_documents")).json();
    // Other test files share this database, so check ours is listed rather
    // than that it's the only one.
    expect(documents).toContainEqual(
      expect.objectContaining({ id: documentId, filename: "newsletter.md", status: "ready" }),
    );
  });

  it("rejects an ingest with both a path and Markdown, or an unsupported file", async () => {
    const both = await call("ingest_spec", { path: "x.md", markdown: SPEC });
    expect(both).toMatchObject({ isError: true, text: "Pass exactly one of path or markdown." });

    const wrongType = await call("ingest_spec", { markdown: SPEC, filename: "spec.docx" });
    expect(wrongType).toMatchObject({ isError: true, text: "Only Markdown (.md) and PDF (.pdf) files are supported." });
  });

  it("starts a run that pauses for human review, and says where to review it", async () => {
    const started = (await call("start_run", { documentId })).json();
    runId = started.runId;
    expect(started.status).toBe("running");

    const status = await waitForStatus("waiting_for_review");
    expect(status).toMatchObject({
      humanReviewRequired: true,
      reviewUrl: `http://spec2test.test/?run=${runId}`,
      counts: { requirements: 3, ambiguous: 1, approved: 0 },
    });
    expect(status.nextAction).toContain(status.reviewUrl);
    expect(status.nextAction).toMatch(/cannot approve tests/);
  });

  it("reports ambiguous requirements while the run waits", async () => {
    const { requirements } = (await call("get_requirements", { runId, ambiguousOnly: true })).json();

    expect(requirements).toEqual([
      expect.objectContaining({
        code: "REQ-03",
        ambiguous: true,
        ambiguityReason: expect.stringContaining("fast"),
        resolvedByReviewer: false,
      }),
    ]);
  });

  it("refuses to export before a human has signed the run off", async () => {
    const result = await call("export_playwright_tests", { runId, outputDir: os.tmpdir() });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Build matrix/);
  });

  it("serves the matrix and exports approved tests once a human has reviewed", async () => {
    // What the reviewer does in the web app: approve REQ-01's tests, then
    // Build matrix. This goes through the same service layer, which the
    // MCP server has no tool for.
    const detail = await getRun(runId);
    const req1 = detail.requirements.find((r) => r.code === "REQ-01");
    for (const tc of detail.testCases.filter((t) => t.requirementId === req1?.id)) {
      await reviewTestCase(tc.id, { actor: "Test reviewer", change: { action: "approve" } });
    }
    await resumeRun(runId, "Test reviewer", schedule);
    await waitForStatus("completed");

    const matrix = (await call("get_traceability_matrix", { runId })).json();
    expect(matrix).toMatchObject({
      final: true,
      // 3 requirements, 1 ambiguous and unresolved -> 2 testable, 1 covered.
      coverage: { covered: 1, total: 2, percent: 50 },
      gaps: { no_approved_tests: 1, unresolved_ambiguity: 1 },
    });

    const outputDir = await mkdtemp(path.join(os.tmpdir(), "spec2test-mcp-"));
    try {
      const exported = (await call("export_playwright_tests", { runId, outputDir })).json();
      expect(await readdir(outputDir)).toEqual([path.basename(exported.files[0])]);
      const spec = await readFile(exported.files[0], "utf8");
      expect(spec).toContain('test.describe("REQ-01: Signup form"');
      expect(spec.match(/test\.fixme\(/g)).toHaveLength(2);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("returns a clear tool error for a run that doesn't exist", async () => {
    const missing = await call("get_run_status", { runId: "00000000-0000-4000-8000-000000000000" });
    expect(missing).toMatchObject({ isError: true, text: "Run not found" });

    const invalid = await call("get_run_status", { runId: "not-a-uuid" });
    expect(invalid).toMatchObject({ isError: true, text: "Invalid run id" });
  });
});
