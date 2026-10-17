import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireEnv } from "@/lib/env";

import * as schema from "./schema";

// Notices (e.g. "schema already exists, skipping") are informational, and
// postgres-js prints them with console.log by default, which would write
// onto the MCP server's stdout, where only protocol messages may go.
const queryClient = postgres(requireEnv("DATABASE_URL"), { onnotice: () => {} });

export const db = drizzle(queryClient, { schema });
