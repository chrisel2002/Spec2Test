CREATE TYPE "public"."review_action" AS ENUM('approved', 'rejected', 'edited', 'requirement_rewritten');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'waiting_for_review', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"test_case_id" uuid,
	"actor" text NOT NULL,
	"action" "review_action" NOT NULL,
	"from_status" "test_case_status",
	"to_status" "test_case_status",
	"changes" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"rate_limited" boolean DEFAULT false NOT NULL,
	"coverage" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
-- Hand-written backfill: before this migration a run was just a shared
-- run_id on agent_runs rows. Create a runs row for each, and attach each
-- document's requirements to its latest run (the only snapshot that was
-- kept). Requirements with no run at all can't be placed and are dropped.
INSERT INTO "runs" ("id", "document_id", "status", "created_at", "finished_at")
SELECT "run_id", "document_id",
	CASE WHEN bool_or("status" = 'failed') THEN 'failed'::run_status ELSE 'completed'::run_status END,
	coalesce(min("started_at"), now()), max("finished_at")
FROM "agent_runs"
GROUP BY "run_id", "document_id";--> statement-breakpoint
DROP INDEX "requirements_document_code_idx";--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "run_id" uuid;--> statement-breakpoint
UPDATE "requirements" r SET "run_id" = (
	SELECT "id" FROM "runs" WHERE "runs"."document_id" = r."document_id"
	ORDER BY "created_at" DESC LIMIT 1
);--> statement-breakpoint
DELETE FROM "requirements" WHERE "run_id" IS NULL;--> statement-breakpoint
ALTER TABLE "requirements" ALTER COLUMN "run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "ambiguity_resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "original_text" text;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_events_run_idx" ON "review_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_document_idx" ON "runs" USING btree ("document_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_run_code_idx" ON "requirements" USING btree ("run_id","code");