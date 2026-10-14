CREATE TYPE "public"."document_status" AS ENUM('embedding', 'waiting', 'failed', 'ready');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status" "document_status" DEFAULT 'embedding' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status_message" text;--> statement-breakpoint
-- Backfill (hand-written): before this migration, chunks were only stored
-- after being embedded, so existing documents have no null embeddings and
-- are marked ready. (One that hit the quota mid-ingest is silently missing
-- its later chunks; delete and re-upload it.)
UPDATE "documents" SET "status" = 'ready'
WHERE NOT EXISTS (
  SELECT 1 FROM "chunks"
  WHERE "chunks"."document_id" = "documents"."id" AND "chunks"."embedding" IS NULL
);
