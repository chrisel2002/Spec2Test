CREATE TABLE "audio_cache" (
	"hash" text PRIMARY KEY NOT NULL,
	"audio" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
