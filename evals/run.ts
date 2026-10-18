// Eval runner.
//
//   pnpm eval                     real model from .env.local (run manually: uses quota)
//   pnpm eval:mock                mock model, no API key; used in CI
//   pnpm eval -- --spec checkout-spec
//   pnpm eval:mock -- --check     exit 1 if any metric is below the CI thresholds
//   pnpm eval -- --compare <a.json> <b.json>
//
// Each run is saved as JSON in evals/results/ (mock runs in
// evals/results/mock/, which is git-ignored) and summarised as a table.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { GoldenSpecSchema } from "./golden/schema";
import { findThresholdFailures } from "./lib/check";
import {
  compareResults,
  type EvalResult,
  EvalResultSchema,
  type SpecResult,
  summaryTable,
} from "./lib/results";
import { MOCK_THRESHOLDS } from "./thresholds";

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, "evals", "results");

// `pnpm eval -- --spec x` passes the "--" through (after the script's own
// flags, for eval:mock); without dropping it, parseArgs would treat every
// flag after it as a positional argument. This runner never needs "--".
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const { values, positionals } = parseArgs({
  args,
  options: {
    mock: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    compare: { type: "boolean", default: false },
    spec: { type: "string", multiple: true },
  },
  allowPositionals: true,
});

function loadResult(file: string): EvalResult {
  return EvalResultSchema.parse(JSON.parse(readFileSync(path.resolve(file), "utf8")));
}

async function main() {
  if (values.compare) {
    if (positionals.length !== 2) throw new Error("Usage: --compare <a.json> <b.json>");
    console.log(compareResults(loadResult(positionals[0]), loadResult(positionals[1])));
    return;
  }

  // The mock is selected through the same env vars the app reads, set
  // before the agent modules are imported.
  if (values.mock) {
    process.env.MODEL_PROVIDER = "mock";
    process.env.MODEL_NAME = "mock";
    process.env.MOCK_MODEL_DELAY_MS ??= "0";
  }
  const provider = process.env.MODEL_PROVIDER;
  const modelName = process.env.MODEL_NAME;
  if (!provider || !modelName) {
    throw new Error("MODEL_PROVIDER and MODEL_NAME must be set (pnpm eval reads .env.local).");
  }

  const [{ runPipeline }, { scoreSpec }, { estimateCostUsd }, { PROMPT_VERSION }, prompts] =
    await Promise.all([
      import("./lib/pipeline"),
      import("./lib/metrics"),
      import("@/lib/agents/cost"),
      import("@/lib/ai/prompts/version"),
      Promise.all([
        import("@/lib/ai/prompts/extract-requirements"),
        import("@/lib/ai/prompts/check-ambiguity"),
        import("@/lib/ai/prompts/generate-tests"),
      ]),
    ]);

  // A short hash of the prompt modules' exports, so two results with the
  // same PROMPT_VERSION but different prompt text are told apart.
  const promptHash = createHash("sha256")
    .update(prompts.map((module) => Object.values(module).map(String).join("\n")).join("\n"))
    .digest("hex")
    .slice(0, 8);

  const goldenFiles = readdirSync(path.join(ROOT, "evals", "golden"))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !values.spec || values.spec.includes(file.replace(/\.json$/, "")));

  const specs: SpecResult[] = [];
  for (const file of goldenFiles) {
    const golden = GoldenSpecSchema.parse(
      JSON.parse(readFileSync(path.join(ROOT, "evals", "golden", file), "utf8")),
    );
    const specPath = path.join(ROOT, golden.specDir, golden.spec);
    process.stderr.write(`Running ${golden.spec} with ${provider}/${modelName}...\n`);

    const started = Date.now();
    try {
      const output = await runPipeline(readFileSync(specPath, "utf8"));
      const { metrics, details } = scoreSpec(golden, output);
      specs.push({
        spec: golden.spec,
        ok: true,
        error: null,
        metrics,
        usage: output.usage,
        costUsd: estimateCostUsd(modelName, output.usage),
        durationMs: output.durationMs,
        stepDurationsMs: output.stepDurationsMs,
        modelCalls: output.calls.length,
        counts: { requirements: output.requirements.length, testCases: output.testCases.length },
        details,
      });
    } catch (error) {
      // Keep going with the other specs, and record why this one failed
      // (most often: the free-tier quota ran out mid-run).
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`  failed: ${message}\n`);
      specs.push({
        spec: golden.spec,
        ok: false,
        error: message.slice(0, 500),
        metrics: null,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        costUsd: 0,
        durationMs: Date.now() - started,
        stepDurationsMs: null,
        modelCalls: 0,
        counts: null,
        details: null,
      });
    }
  }

  const result: EvalResult = {
    createdAt: new Date().toISOString(),
    model: { provider, name: modelName },
    promptVersion: PROMPT_VERSION,
    promptHash,
    specs,
  };

  const outDir = values.mock ? path.join(RESULTS_DIR, "mock") : RESULTS_DIR;
  mkdirSync(outDir, { recursive: true });
  const stamp = result.createdAt.slice(0, 16).replace(/:/g, "");
  const outFile = path.join(outDir, `${stamp}_${modelName.replace(/[^\w.-]+/g, "-")}_${PROMPT_VERSION}.json`);
  writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");

  // The Insights page shows the latest real result per spec; it imports
  // this file at build time, so it ships with the deployed app.
  if (!values.mock) updateLatest(result);

  console.log(summaryTable(result));
  console.log(`\nSaved ${path.relative(ROOT, outFile)}`);

  if (values.check) checkThresholds(result);
}

function updateLatest(result: EvalResult) {
  const latestFile = path.join(RESULTS_DIR, "latest.json");
  let latest: EvalResult["specs"][number][] = [];
  try {
    latest = JSON.parse(readFileSync(latestFile, "utf8")).specs ?? [];
  } catch {
    // First real run: no latest.json yet.
  }
  const bySpec = new Map(latest.map((s) => [s.spec, s]));
  for (const spec of result.specs) if (spec.ok) bySpec.set(spec.spec, spec);
  writeFileSync(
    latestFile,
    JSON.stringify({ ...result, specs: [...bySpec.values()] }, null, 2) + "\n",
  );
}

// CI gate for the mock run: the mock is deterministic, so any metric below
// its threshold means a code change broke part of the pipeline.
function checkThresholds(result: EvalResult) {
  const failures = findThresholdFailures(result, MOCK_THRESHOLDS);
  if (failures.length > 0) {
    console.error(`\nEval check failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\nEval check passed: every metric meets its threshold.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
