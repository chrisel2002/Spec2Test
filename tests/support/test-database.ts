import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Creates a test database if it doesn't exist, applies our migrations, and
// empties it, so each test run starts from "no documents uploaded". Used
// by the e2e and MCP test setups, each with its own database so they can
// run at the same time without wiping each other's data.
export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
  if (!existing) await admin.unsafe(`create database "${databaseName}"`);
  await admin.end();

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "src/lib/db/migrations" });
  // Cascades to chunks, runs, requirements, test cases, and review history.
  await client`truncate documents cascade`;
  await client.end();
}
