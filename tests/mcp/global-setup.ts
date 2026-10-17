import { resetTestDatabase } from "../support/test-database";

export default async function globalSetup() {
  await resetTestDatabase(
    process.env.MCP_TEST_DATABASE_URL ??
      "postgresql://spec2test:spec2test@localhost:5432/spec2test_mcp",
  );
}
