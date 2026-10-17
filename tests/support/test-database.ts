import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Makes a test database ready from nothing, so the tests work on a fresh
// machine and in CI, where the Postgres service only creates the default
// "spec2test" database:
//
// 1. connect to the server's built-in "postgres" database (it always
//    exists) and create the test database if it's missing,
// 2. enable pgvector in it (CREATE EXTENSION is per database),
// 3. apply our migrations,
// 4. empty it, so every run starts from "no documents uploaded".
//
// Used by the e2e and MCP test setups, each with its own database so they
// can run at the same time without wiping each other's data.
export async function prepareTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
    // CREATE DATABASE can't take a bound parameter; sql() quotes the name
    // as an identifier instead.
    if (!existing) await admin`create database ${admin(databaseName)}`;
  } finally {
    await admin.end();
  }

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    // The first migration also creates it; doing it here as well makes the
    // dependency explicit and fails with a clear error if the server
    // doesn't have pgvector installed.
    await client`create extension if not exists vector`;
    await migrate(drizzle(client), { migrationsFolder: "src/lib/db/migrations" });
    // Cascades to chunks, runs, requirements, test cases, and review history.
    await client`truncate documents cascade`;
  } finally {
    await client.end();
  }
}
