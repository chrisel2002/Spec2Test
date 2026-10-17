import { prepareTestDatabase } from "../support/test-database";

import { E2E_DATABASE_URL } from "./env";

// Runs once before all e2e tests: creates the e2e database if needed,
// enables pgvector, migrates it, and empties it. Playwright has already
// started the web server by now, but nothing has queried the database yet
// (see the webServer readiness URL in playwright.config.ts).
export default async function globalSetup() {
  await prepareTestDatabase(E2E_DATABASE_URL);
}
