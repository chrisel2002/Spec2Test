import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts (tests/unit) because these tests hit a
// real Postgres instance and the real embedding/chat API — they need
// DATABASE_URL and a provider API key, which CI doesn't have, so they're
// run locally via `pnpm test:integration` and excluded from CI's `pnpm test`.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // These tests share one real Postgres instance and may ingest the
    // same sample file (same content_hash), so running files in parallel
    // races on document creation/cleanup. Integration suites against
    // shared external state are conventionally run serially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
