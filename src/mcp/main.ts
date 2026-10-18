// Entry point for the Spec2Test MCP server over stdio. Compiled to
// dist/mcp/main.mjs by `pnpm mcp:build` (run automatically by pnpm install),
// which is what Claude Code starts: plain JavaScript loads in about two
// seconds, where running this TypeScript through tsx first had to
// transpile hundreds of files, slow enough on a cold start to hit Claude
// Code's 30-second connection timeout.
//
// With stdio, stdout *is* the protocol: every byte on it must be a JSON-RPC
// message for the client (e.g. Claude Code). So before anything else:
// route stray console.log output to stderr, and load .env.local, both
// before the app's modules are imported (the DB client reads DATABASE_URL
// as soon as it's imported, hence the dynamic import below).
//
// Our server code imports "server-only", which throws outside Next.js
// unless the react-server export condition is set. The build replaces it
// with the package's own empty react-server build, so plain `node` works.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

// src/mcp/main.ts and dist/mcp/main.mjs are both two levels below the
// repo root, so this finds .env.local from either, whatever the cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = path.join(repoRoot, ".env.local");
// loadEnvFile doesn't overwrite variables that are already set, so env
// passed in by the MCP client (or CI) wins over .env.local.
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const [{ StdioServerTransport }, { createSpec2TestServer }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/stdio.js"),
    import("./server"),
  ]);
  await createSpec2TestServer().connect(new StdioServerTransport());
  console.error("[spec2test-mcp] ready on stdio");
}

main().catch((error) => {
  console.error("[spec2test-mcp] failed to start", error);
  process.exit(1);
});
