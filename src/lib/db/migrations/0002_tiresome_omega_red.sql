ALTER TABLE "chunks" ADD COLUMN "heading" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "heading_level" integer;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "page" integer;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "char_start" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "char_end" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_hash" text NOT NULL;--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_content_hash_unique" UNIQUE("content_hash");