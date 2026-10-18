// Turns a Postgres connection string, local or Neon, into what postgres.js
// needs. Pure, so it's unit-tested without a database.
//
// Neon's dashboard strings look like
//   postgresql://user:pass@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require
// and need two adjustments for postgres.js:
//
// - channel_binding is a libpq setting postgres.js doesn't know; it passes
//   unknown parameters to the server as session settings, and Postgres
//   then rejects the connection ("unrecognized configuration parameter").
//   It's dropped; TLS still comes from sslmode=require.
// - A "-pooler" host goes through PgBouncer in transaction mode, where
//   each transaction may run on a different server connection, so a
//   statement prepared on one isn't there for the next. Prepared
//   statements are turned off for pooled connections.

export type PostgresConfig = { url: string; prepare: boolean };

export function postgresConfig(databaseUrl: string): PostgresConfig {
  const url = new URL(databaseUrl);
  url.searchParams.delete("channel_binding");
  return {
    url: url.toString(),
    prepare: !url.hostname.includes("-pooler"),
  };
}

// For logs: which database, without the credentials.
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}${url.pathname}`;
}
