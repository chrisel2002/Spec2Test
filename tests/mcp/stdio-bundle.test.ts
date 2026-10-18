import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

// Starts the compiled server (dist/mcp/main.mjs, built by pnpm install /
// pnpm mcp:build) exactly the way Claude Code does: a child process
// speaking MCP over stdin/stdout. Run from a different working directory,
// to prove an absolute-path registration works from anywhere.

const bundle = path.resolve("dist/mcp/main.mjs");

describe("compiled MCP server over stdio", () => {
  // Locally, skipped until the bundle has been built. In CI it never is
  // skipped: a missing bundle means the build step broke, so it fails.
  it.skipIf(!existsSync(bundle) && !process.env.CI)(
    "starts quickly, answers the handshake, and serves a tool call",
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundle],
        cwd: tmpdir(),
        env: { ...process.env } as Record<string, string>,
        stderr: "pipe",
      });
      const client = new Client({ name: "stdio-test", version: "0.0.0" });

      const started = Date.now();
      await client.connect(transport);
      // Claude Code gives up after 30 s; leave a wide margin for slow CI.
      expect(Date.now() - started).toBeLessThan(15_000);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("get_run_status");

      const result = await client.callTool({ name: "list_documents", arguments: {} });
      expect(result.isError).toBeFalsy();

      await client.close();
    },
    30_000,
  );
});
