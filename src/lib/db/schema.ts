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

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Human-readable, e.g. "REQ-01" — assigned by our code after extraction,
    // never by the model, so numbering stays sequential and gap-free across
    // batched extraction calls. Unique per document, not globally.
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("requirements_document_code_idx").on(table.documentId, table.code)],
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
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  // Correlates the 3 step-rows of one pipeline execution, so the status
  // endpoint can fetch "this run's steps" instead of every historical row
  // for the document. Not a FK — there's no parent "runs" table, just a
  // shared id minted once when a run starts.
  runId: uuid("run_id").notNull(),
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
