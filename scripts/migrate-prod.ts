// pnpm db:migrate:prod
//
// Brings the production database (Neon) up to date. Run it from your
// laptop before deploying a change that adds a migration, not on every
// container start: the free web service may start many times a day (it
// sleeps when idle), and schema changes should happen once, deliberately,
// from a machine where you can see the result.
//
// Reads DATABASE_URL_UNPOOLED from .env.production.local (git-ignored).
// It must be Neon's *direct* connection string: migrations need a real
// session (DDL, advisory locks), which PgBouncer's transaction pooling
// doesn't provide. The app itself uses the pooled string.
//
// Steps, each safe to repeat: enable pgvector, apply Drizzle migrations,
// create the LangGraph checkpointer's tables. Nothing secret is printed:
// only the host and database name.

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { describeDatabase, postgresConfig } from "@/lib/db/connection";

async function main() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Put Neon's direct connection string in .env.production.local.",
    );
  }
  if (new URL(databaseUrl).hostname.includes("-pooler")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED points at a pooled (-pooler) host. Use Neon's direct connection string for migrations.",
    );
  }

  const { url } = postgresConfig(databaseUrl);
  console.log(`Migrating ${describeDatabase(url)}`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    // 1. pgvector is per database; the first migration also creates it,
    // but doing it explicitly fails fast with a clear error if it's missing.
    await sql`create extension if not exists vector`;
    const [vector] = await sql`select extversion from pg_extension where extname = 'vector'`;
    console.log(`  pgvector ${vector.extversion}`);

    // 2. Drizzle migrations: applies only the ones not yet recorded in
    // drizzle.__drizzle_migrations.
    const before = await appliedCount(sql);
    await migrate(drizzle(sql), { migrationsFolder: "src/lib/db/migrations" });
    const after = await appliedCount(sql);
    console.log(`  migrations: ${after - before} applied now, ${after} in total`);

    // 3. The checkpointer's tables (in their own "langgraph" schema), so the
    // app never has to run DDL at request time.
    await sql`create schema if not exists langgraph`;
    const saver = PostgresSaver.fromConnString(url, { schema: "langgraph" });
    await saver.setup();
    await saver.end();
    console.log("  langgraph checkpoint tables ready");
  } finally {
    await sql.end();
  }
  console.log("Done.");
}

async function appliedCount(sql: postgres.Sql): Promise<number> {
  const [{ exists }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ count }] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
  return count;
}

main().catch((error) => {
  // The message only: an error object from the driver can include the
  // connection options.
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
