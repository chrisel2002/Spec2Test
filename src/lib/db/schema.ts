import {
  boolean,
  customType,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const testCaseStatusEnum = pgEnum("test_case_status", [
  "draft",
  "approved",
  "rejected",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

// embedding: chunks stored, embeddings in progress
// waiting:   paused because the embedding quota ran out; resumable
// failed:    stopped on a non-quota error; resumable
// ready:     every chunk has an embedding
export const documentStatusEnum = pgEnum("document_status", [
  "embedding",
  "waiting",
  "failed",
  "ready",
]);

// running:            a graph node is executing
// waiting_for_review: paused at the human-review checkpoint (interrupt())
// completed:          the matrix was built after review
// failed:             a node threw; retrying resumes from the last checkpoint
export const runStatusEnum = pgEnum("run_status", [
  "running",
  "waiting_for_review",
  "completed",
  "failed",
]);

export const reviewActionEnum = pgEnum("review_action", [
  "approved",
  "rejected",
  "edited",
  "requirement_rewritten",
]);

export const testCaseTypeEnum = pgEnum("test_case_type", [
  "positive",
  "negative",
  "boundary",
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  rawText: text("raw_text").notNull(),
  // SHA-256 of the raw uploaded bytes. Lets the upload endpoint detect a
  // re-upload of the same file and skip re-parsing/re-embedding it.
  contentHash: text("content_hash").notNull().unique(),
  status: documentStatusEnum("status").notNull().default("embedding"),
  // User-facing explanation for "waiting"/"failed", e.g. which quota ran out.
  statusMessage: text("status_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Dimensions must match EMBEDDING_DIMENSIONS in .env.example — pgvector
// columns have a fixed size, so changing the embedding model's output size
// means a migration. Google's gemini-embedding-001 defaults to 3072 dims
// but supports truncating to 768 via providerOptions.google.outputDimensionality.
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    // Citation metadata, carried over from chunkDocument() in lib/ingest.
    heading: text("heading"),
    headingLevel: integer("heading_level"),
    page: integer("page"),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // HNSW over ivfflat: no training step needed (works correctly even on
    // an empty or small table) and better query recall, at the cost of
    // slower inserts — a good trade-off at our scale of a few documents.
    index("chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// One row per agent pipeline execution. Its id doubles as LangGraph's
// thread_id, so the checkpointer's saved graph state for this run is found
// by the same key. The checkpoint holds LangGraph's internal state (opaque
// blobs); this table holds what the UI needs to query: status and history.
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("running"),
    error: text("error"),
    // True when the failure was a provider rate limit/quota, so the UI can
    // say "wait and retry" instead of showing a raw error.
    rateLimited: boolean("rate_limited").notNull().default(false),
    // Coverage at the moment the matrix was built: the signed-off number.
    coverage: json("coverage").$type<{ covered: number; total: number }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("runs_document_idx").on(table.documentId, table.createdAt)],
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Requirements belong to a run, not just a document, so every past run
    // keeps its own reviewed snapshot and can be reopened from the history.
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    // Human-readable, e.g. "REQ-01" — assigned by our code after extraction,
    // never by the model, so numbering stays sequential and gap-free across
    // batched extraction calls. Unique per run, not globally.
    code: text("code").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    // Plain array rather than a join table: Postgres can't enforce a real
    // FK constraint on array elements, but a requirement citing 1-2 source
    // chunks doesn't need one — simpler to store and query than a separate
    // requirement_chunks table at this scale.
    sourceChunkIds: uuid("source_chunk_ids").array().notNull().default([]),
    isAmbiguous: boolean("is_ambiguous").notNull().default(false),
    ambiguityReason: text("ambiguity_reason"),
    suggestedRewrite: text("suggested_rewrite"),
    // Set when a reviewer resolves an ambiguous requirement: `text` becomes
    // the accepted rewrite and the model's original wording is kept here.
    ambiguityResolved: boolean("ambiguity_resolved").notNull().default(false),
    originalText: text("original_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("requirements_run_code_idx").on(table.runId, table.code)],
);

export const testCases = pgTable("test_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  requirementId: uuid("requirement_id")
    .notNull()
    .references(() => requirements.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: testCaseTypeEnum("type").notNull(),
  given: text("given").notNull(),
  when: text("when").notNull(),
  then: text("then").notNull(),
  status: testCaseStatusEnum("status").notNull().default("draft"),
  // True when generated from an ambiguous requirement's suggested rewrite
  // rather than its original (possibly untestable) text.
  basedOnAssumption: boolean("based_on_assumption").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only audit trail of human review: who changed what, and when.
// testCaseId is nulled rather than cascaded when a test is deleted (e.g.
// regenerated after a rewrite), so the history outlives the row it describes.
export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    testCaseId: uuid("test_case_id").references(() => testCases.id, {
      onDelete: "set null",
    }),
    actor: text("actor").notNull(),
    action: reviewActionEnum("action").notNull(),
    fromStatus: testCaseStatusEnum("from_status"),
    toStatus: testCaseStatusEnum("to_status"),
    // Before/after values for edits and rewrites.
    changes: json("changes").$type<Record<string, { from: string; to: string }>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("review_events_run_idx").on(table.runId, table.createdAt)],
);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  // The run this step belongs to. A run has one row per executed step
  // (a retried step gets a new row; the latest row per step wins).
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  status: agentRunStatusEnum("status").notNull().default("pending"),
  // Field names match the AI SDK's LanguageModelUsage shape directly, so
  // results from generateObject() can be stored with no translation.
  tokenUsage: json("token_usage").$type<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>(),
  costUsd: real("cost_usd"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
});

// Drizzle 0.45 has no built-in bytea column, so declare one. postgres-js
// already returns bytea values as Node Buffers, so no conversion is needed.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Generated MP3s, keyed by sha256(text, voice, model), so replaying the same
// text doesn't spend ElevenLabs quota twice. Stored in Postgres rather than
// on disk because Cloud Run's filesystem is per-instance and wiped on
// restart. No eviction yet: clips are ~30-100 KB, fine at portfolio scale.
export const audioCache = pgTable("audio_cache", {
  hash: text("hash").primaryKey(),
  audio: bytea("audio").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
