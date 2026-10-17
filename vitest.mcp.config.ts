import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// MCP server tests: the real server and service layer against a real
// Postgres, with a mocked model and mocked embeddings, so they need a
// database but no API keys. CI runs them in the job that has a Postgres
// service. Their own database, so they can run alongside the e2e tests.
const databaseUrl =
  process.env.MCP_TEST_DATABASE_URL ??
  "postgresql://spec2test:spec2test@localhost:5432/spec2test_mcp";

export default defineConfig({
  test: {
    include: ["tests/mcp/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/mcp/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Everything the app needs, set before any module reads it.
    env: {
      DATABASE_URL: databaseUrl,
      MODEL_PROVIDER: "mock",
      MODEL_NAME: "mock",
      MOCK_MODEL_DELAY_MS: "0",
      EMBEDDING_PROVIDER: "mock",
      EMBEDDING_DIMENSIONS: "768",
      APP_URL: "http://spec2test.test",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
