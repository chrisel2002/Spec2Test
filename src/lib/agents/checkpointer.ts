import "server-only";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";

// LangGraph saves a checkpoint (the full graph state plus which node runs
// next) after every step, keyed by thread_id — for us, the run id. That
// saved state is what makes a paused run resumable and a failed run
// retryable from the step that failed.
//
// Postgres rather than LangGraph's MemorySaver: an in-memory checkpoint
// dies with the server process, so a run waiting for review would become
// un-resumable after any restart or redeploy, and couldn't be resumed by
// a different Cloud Run instance. Its tables live in their own
// "langgraph" schema, created and migrated by the library (not Drizzle),
// so they stay out of our own migrations.
const SCHEMA = "langgraph";

const globalForCheckpointer = globalThis as unknown as {
  checkpointer?: Promise<PostgresSaver>;
};

async function createCheckpointer(): Promise<PostgresSaver> {
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`));
  const saver = PostgresSaver.fromConnString(requireEnv("DATABASE_URL"), {
    schema: SCHEMA,
  });
  await saver.setup();
  return saver;
}

// One saver (and its connection pool) per process, set up on first use.
export function getCheckpointer(): Promise<PostgresSaver> {
  globalForCheckpointer.checkpointer ??= createCheckpointer().catch((error) => {
    // Don't cache a failed setup; let the next call try again.
    globalForCheckpointer.checkpointer = undefined;
    throw error;
  });
  return globalForCheckpointer.checkpointer;
}
