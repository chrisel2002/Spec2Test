// pnpm db:seed-demo
//
// Copies the demo data, a finished run of each sample spec, from your local
// database to the production one, so visitors see real results without
// the public site ever calling a model.
//
// Before running it, locally (pnpm dev, with a real model): upload
// sample-specs/login-account-spec.md and sample-specs/checkout-spec.md,
// run the agent on each, review the tests, and build the matrix. The
// script copies each spec's latest *completed* run: the document and its
// chunks (with embeddings, so chat works for visitors with a code), the
// run, its requirements, test cases, review history, and per-step token
// usage and cost (which the Insights page charts).
//
// Source: DATABASE_URL from .env.local. Target: DATABASE_URL_UNPOOLED
// from .env.production.local (Neon's direct connection string), so run
// `pnpm db:migrate:prod` first.
//
// Only the sample specs can be copied: documents are picked by the SHA-256
// of the files in sample-specs/, so nothing else you uploaded locally (and
// nothing personal) can end up on the public site. Safe to repeat: each
// spec's previous demo copy is deleted first, in the same transaction.
//
// Not copied: LangGraph checkpoints. A completed run is read-only and never
// resumes, so the app doesn't need them.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { describeDatabase, postgresConfig } from "@/lib/db/connection";
import {
  agentRuns,
  chunks,
  documents,
  requirements,
  reviewEvents,
  runs,
  testCases,
} from "@/lib/db/schema";

const SAMPLE_SPECS = ["sample-specs/login-account-spec.md", "sample-specs/checkout-spec.md"];

// Rows per INSERT: well under Postgres's 65,535 parameters per statement.
const BATCH = 200;

function connect(databaseUrl: string) {
  const config = postgresConfig(databaseUrl);
  const client = postgres(config.url, { max: 1, prepare: config.prepare, onnotice: () => {} });
  return { client, db: drizzle(client) };
}

type Db = ReturnType<typeof connect>["db"];

async function loadDemo(source: Db, path: string) {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  const [document] = await source.select().from(documents).where(eq(documents.contentHash, hash));
  if (!document) {
    throw new Error(`${path} isn't in the local database. Upload it with pnpm dev first.`);
  }
  if (document.status !== "ready") {
    throw new Error(`${path} hasn't finished embedding locally (status: ${document.status}).`);
  }
  const [run] = await source
    .select()
    .from(runs)
    .where(and(eq(runs.documentId, document.id), eq(runs.status, "completed")))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  if (!run) {
    throw new Error(`${path} has no completed run locally. Run the agent, review, and build the matrix.`);
  }

  const reqs = await source.select().from(requirements).where(eq(requirements.runId, run.id));
  const tests = reqs.length
    ? await source.select().from(testCases).where(inArray(testCases.requirementId, reqs.map((r) => r.id)))
    : [];
  return {
    path,
    hash,
    document,
    chunks: await source.select().from(chunks).where(eq(chunks.documentId, document.id)),
    run,
    requirements: reqs,
    testCases: tests,
    reviewEvents: await source.select().from(reviewEvents).where(eq(reviewEvents.runId, run.id)),
    agentRuns: await source.select().from(agentRuns).where(eq(agentRuns.runId, run.id)),
  };
}

type Demo = Awaited<ReturnType<typeof loadDemo>>;

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function writeDemo(target: Db, demo: Demo) {
  await target.transaction(async (tx) => {
    // Deleting the document cascades to everything below it. Matched by
    // hash as well as id, in case the spec was uploaded on the live site.
    await tx.delete(documents).where(eq(documents.contentHash, demo.hash));
    await tx.delete(documents).where(eq(documents.id, demo.document.id));

    // Parents before children, for the foreign keys.
    await tx.insert(documents).values(demo.document);
    await insertInBatches(demo.chunks, (batch) => tx.insert(chunks).values(batch));
    // No live process owns this run on the target.
    await tx.insert(runs).values({ ...demo.run, heartbeatAt: null });
    await insertInBatches(demo.requirements, (batch) => tx.insert(requirements).values(batch));
    await insertInBatches(demo.testCases, (batch) => tx.insert(testCases).values(batch));
    await insertInBatches(demo.reviewEvents, (batch) => tx.insert(reviewEvents).values(batch));
    await insertInBatches(demo.agentRuns, (batch) => tx.insert(agentRuns).values(batch));
  });
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!sourceUrl) throw new Error("DATABASE_URL (the local database) is not set in .env.local.");
  if (!targetUrl) {
    throw new Error("DATABASE_URL_UNPOOLED is not set. Put Neon's direct connection string in .env.production.local.");
  }
  if (describeDatabase(sourceUrl) === describeDatabase(targetUrl)) {
    throw new Error("The source and target are the same database.");
  }

  const source = connect(sourceUrl);
  const target = connect(targetUrl);
  try {
    console.log(`From ${describeDatabase(sourceUrl)} to ${describeDatabase(targetUrl)}`);
    // Load both before writing either, so a missing run stops the script
    // before anything on the target changes.
    const demos: Demo[] = [];
    for (const path of SAMPLE_SPECS) demos.push(await loadDemo(source.db, path));
    for (const demo of demos) {
      await writeDemo(target.db, demo);
      const approved = demo.testCases.filter((t) => t.status === "approved").length;
      console.log(
        `  ${demo.path}: ${demo.chunks.length} chunks, ${demo.requirements.length} requirements, ` +
          `${demo.testCases.length} tests (${approved} approved), ${demo.reviewEvents.length} review events`,
      );
    }
    console.log("Done.");
  } finally {
    await source.client.end();
    await target.client.end();
  }
}

main().catch((error) => {
  // The message only: a driver error can include connection options.
  console.error(`Seeding failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
