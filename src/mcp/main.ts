// Entry point for the Spec2Test MCP server over stdio (pnpm mcp).
//
// With stdio, stdout *is* the protocol: every byte on it must be a JSON-RPC
// message for the client (e.g. Claude Code). So before anything else:
// route stray console.log output to stderr, and load .env.local, both
// before the app's modules are imported (the DB client reads DATABASE_URL
// as soon as it's imported, hence the dynamic import below).
//
// Run with `node --conditions=react-server`: our server code imports
// "server-only", which throws unless the react-server export condition is
// set, as it is inside Next.js.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

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
