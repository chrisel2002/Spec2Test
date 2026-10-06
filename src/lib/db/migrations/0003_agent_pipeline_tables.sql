CREATE TYPE "public"."test_case_type" AS ENUM('positive', 'negative', 'boundary');--> statement-breakpoint
ALTER TABLE "requirements" DROP CONSTRAINT "requirements_chunk_id_chunks_id_fk";--> statement-breakpoint
ALTER TABLE "requirements" DROP COLUMN "chunk_id";--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "source_chunk_ids" uuid[] NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "suggested_rewrite" text;--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_document_code_idx" ON "requirements" ("document_id", "code");--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "type" "test_case_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "based_on_assumption" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "run_id" uuid NOT NULL;
