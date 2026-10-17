import { prepareTestDatabase } from "../support/test-database";

// Runs before any MCP test file is loaded (and so before anything opens a
// connection): creates the MCP test database if needed, enables pgvector,
// migrates it, and empties it.
export default async function globalSetup() {
  await prepareTestDatabase(
    process.env.MCP_TEST_DATABASE_URL ??
      "postgresql://spec2test:spec2test@localhost:5432/spec2test_mcp",
  );
}
