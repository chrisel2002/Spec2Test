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
    url: baseURL,
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
    },
  },
});
