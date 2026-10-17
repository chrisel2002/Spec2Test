import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL, E2E_PORT } from "./tests/e2e/env";

const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${E2E_PORT}`,
    // Playwright starts this server *before* globalSetup runs, so its
    // readiness check must not touch the database: on a fresh machine or
    // in CI, the e2e database doesn't exist until globalSetup creates it.
    // The page at / queries it, so wait for a static file instead. The
    // first real query then comes from a test, after globalSetup.
    url: `${baseURL}/favicon.ico`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Everything the app needs, so e2e runs with no .env.local and no API
    // keys (as in CI). Variables set here win over .env.local.
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // No real embedding or model calls: see the mock short-circuits in
      // src/lib/ai/embeddings.ts and src/lib/ai/mock-model.ts.
      EMBEDDING_PROVIDER: "mock",
      EMBEDDING_DIMENSIONS: "768",
      MODEL_PROVIDER: "mock",
      MODEL_NAME: "mock",
      MOCK_MODEL_DELAY_MS: "50",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
