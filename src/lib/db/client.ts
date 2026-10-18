import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireEnv } from "@/lib/env";

import { postgresConfig } from "./connection";
import * as schema from "./schema";

// Works with a local database and with Neon's pooled connection string
// (see postgresConfig). Notices (e.g. "schema already exists, skipping")
// are informational, and postgres-js prints them with console.log by
// default, which would write onto the MCP server's stdout, where only
// protocol messages may go.
const config = postgresConfig(requireEnv("DATABASE_URL"));
const queryClient = postgres(config.url, { prepare: config.prepare, onnotice: () => {} });

export const db = drizzle(queryClient, { schema });
