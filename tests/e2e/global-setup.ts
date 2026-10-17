import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { E2E_DATABASE_URL } from "./env";

// Runs once before all e2e tests: creates the e2e database if it doesn't
// exist, applies our migrations, and empties it, so every run starts from
// "no documents uploaded" regardless of what the last run left behind.
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
  if (!existing) await admin.unsafe(`create database "${databaseName}"`);
  await admin.end();

  const client = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "src/lib/db/migrations" });
  // Cascades to chunks, runs, requirements, test cases, and review history.
  await client`truncate documents cascade`;
  await client.end();
}
