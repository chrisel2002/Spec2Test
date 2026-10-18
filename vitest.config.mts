import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // pnpm test:coverage. Measures src/lib/ only, and only the code unit
    // tests can reach: modules that need Postgres, the LangGraph
    // checkpointer, or a live model are exercised by the MCP and e2e
    // suites (pnpm test:mcp, pnpm test:e2e), which run against a real
    // database in CI, and are left out here rather than dragging the
    // number down with code no unit test should run.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/db/**",
        // Every service except errors.ts, which is pure.
        "src/lib/services/{documents,exports,http,insights,matrix,rate-limits,review,runs}.ts",
        "src/lib/agents/{checkpointer,graph,runner,tracking}.ts",
        "src/lib/agents/nodes/*-node.ts",
        "src/lib/ingest/pipeline.ts",
        "src/lib/ai/retrieval.ts",
        "src/lib/runs/sse.ts",
      ],
      reporter: ["text-summary", "text", "html"],
      // Set a few points under the measured numbers, so a change that
      // adds untested logic fails CI without every small refactor doing so.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
