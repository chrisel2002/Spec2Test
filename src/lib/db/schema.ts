import {
  boolean,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
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

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  rawText: text("raw_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Embeddings use OpenAI's text-embedding-3-small dimension (1536). Revisit
// if we switch embedding models, since pgvector columns have a fixed size.
export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").references(() => chunks.id, {
    onDelete: "set null",
  }),
  text: text("text").notNull(),
  isAmbiguous: boolean("is_ambiguous").notNull().default(false),
  ambiguityReason: text("ambiguity_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const testCases = pgTable("test_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  requirementId: uuid("requirement_id")
    .notNull()
    .references(() => requirements.id, { onDelete: "cascade" }),
  given: text("given").notNull(),
  when: text("when").notNull(),
  then: text("then").notNull(),
  status: testCaseStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  status: agentRunStatusEnum("status").notNull().default("pending"),
  tokenUsage: json("token_usage").$type<{
    promptTokens: number;
    completionTokens: number;
  }>(),
  costUsd: real("cost_usd"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
});
