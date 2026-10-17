import { resetTestDatabase } from "../support/test-database";

import { E2E_DATABASE_URL } from "./env";

// Runs once before all e2e tests: a fresh, migrated, empty e2e database.
export default async function globalSetup() {
  await resetTestDatabase(E2E_DATABASE_URL);
}
