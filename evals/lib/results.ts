import { z } from "zod";

// One saved eval run: which model and prompts, and per spec the metrics,
// cost, timing, and the details behind each score (what was missed, which
// ambiguities were wrong), so a regression can be traced to its cause.
// Also read by the web app's Insights page, hence the schema.

const nullableRatio = z.number().min(0).max(1).nullable();

export const MetricsSchema = z.object({
  requirementRecall: z.number().min(0).max(1),
  requirementPrecision: nullableRatio,
  ambiguityPrecision: nullableRatio,
  ambiguityRecall: nullableRatio,
  boundaryCoverage: nullableRatio,
  grounding: nullableRatio,
  schemaValidity: nullableRatio,
});

const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

export const SpecResultSchema = z.object({
  spec: z.string(),
  ok: z.boolean(),
  // Set when the run failed (e.g. the quota ran out); metrics are absent.
  error: z.string().nullable(),
  metrics: MetricsSchema.nullable(),
  usage: UsageSchema,
  costUsd: z.number(),
  durationMs: z.number(),
  stepDurationsMs: z.object({ extract: z.number(), ambiguity: z.number(), tests: z.number() }).nullable(),
  modelCalls: z.number(),
  counts: z.object({ requirements: z.number(), testCases: z.number() }).nullable(),
  details: z
    .object({
      missedRequirements: z.array(z.string()),
      unmatchedExtracted: z.array(z.string()),
      ambiguity: z.object({
        truePositives: z.array(z.string()),
        falsePositives: z.array(z.string()),
        falseNegatives: z.array(z.string()),
      }),
      boundaries: z.array(
        z.object({
          id: z.string(),
          value: z.string(),
          covered: z.boolean(),
          testsOfRequirement: z.array(z.string()).optional(),
        }),
      ),
      // Extra checks for adversarial specs (see the injection golden file).
      forbiddenOutput: z.array(z.string()).default([]),
    })
    .nullable(),
});

export const EvalResultSchema = z.object({
  createdAt: z.string(),
  model: z.object({ provider: z.string(), name: z.string() }),
  promptVersion: z.string(),
  promptHash: z.string(),
  specs: z.array(SpecResultSchema),
});

export type Metrics = z.infer<typeof MetricsSchema>;
export type SpecResult = z.infer<typeof SpecResultSchema>;
export type EvalResult = z.infer<typeof EvalResultSchema>;

export const METRIC_LABELS: Record<keyof Metrics, string> = {
  requirementRecall: "Requirement recall",
  requirementPrecision: "Requirement precision",
  ambiguityPrecision: "Ambiguity precision",
  ambiguityRecall: "Ambiguity recall",
  boundaryCoverage: "Boundary coverage",
  grounding: "Grounding",
  schemaValidity: "Schema validity (1st try)",
};

export function formatRatio(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

// "spec | metric | ..." rows for a quick look in the terminal.
export function summaryTable(result: EvalResult): string {
  const specs = result.specs;
  const header = ["Metric", ...specs.map((s) => s.spec)];
  const rows: string[][] = (Object.keys(METRIC_LABELS) as (keyof Metrics)[]).map((key) => [
    METRIC_LABELS[key],
    ...specs.map((s) => (s.metrics ? formatRatio(s.metrics[key]) : "failed")),
  ]);
  rows.push(["Tokens", ...specs.map((s) => s.usage.totalTokens.toLocaleString("en"))]);
  rows.push(["Est. cost", ...specs.map((s) => `$${s.costUsd.toFixed(4)}`)]);
  rows.push(["Run time", ...specs.map((s) => `${(s.durationMs / 1000).toFixed(1)} s`)]);
  return renderTable([header, ...rows]);
}

// Metric-by-metric difference between two saved results, per spec present
// in both: "B - A" in percentage points, marked better or worse.
export function compareResults(a: EvalResult, b: EvalResult): string {
  const lines = [
    `A: ${a.createdAt}  ${a.model.name}  prompts ${a.promptVersion} (${a.promptHash})`,
    `B: ${b.createdAt}  ${b.model.name}  prompts ${b.promptVersion} (${b.promptHash})`,
    "",
  ];
  for (const specA of a.specs) {
    const specB = b.specs.find((s) => s.spec === specA.spec);
    if (!specB) continue;
    const rows: string[][] = [["Metric", "A", "B", "Change"]];
    for (const key of Object.keys(METRIC_LABELS) as (keyof Metrics)[]) {
      const valueA = specA.metrics?.[key] ?? null;
      const valueB = specB.metrics?.[key] ?? null;
      rows.push([METRIC_LABELS[key], formatRatio(valueA), formatRatio(valueB), describeChange(valueA, valueB)]);
    }
    rows.push(["Tokens", String(specA.usage.totalTokens), String(specB.usage.totalTokens), signed(specB.usage.totalTokens - specA.usage.totalTokens)]);
    rows.push(["Run time (s)", (specA.durationMs / 1000).toFixed(1), (specB.durationMs / 1000).toFixed(1), signed((specB.durationMs - specA.durationMs) / 1000, 1)]);
    lines.push(specA.spec, renderTable(rows), "");
  }
  return lines.join("\n");
}

function describeChange(a: number | null, b: number | null): string {
  if (a === null || b === null) return "";
  const points = Math.round((b - a) * 100);
  if (points === 0) return "same";
  return `${points > 0 ? "+" : ""}${points} pts ${points > 0 ? "better" : "worse"}`;
}

function signed(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  // Avoid "-0.0" for differences too small to show.
  if (rounded === 0) return (0).toFixed(digits);
  return rounded > 0 ? `+${rounded.toFixed(digits)}` : rounded.toFixed(digits);
}

function renderTable(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const line = (row: string[]) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  return [line(rows[0]), widths.map((w) => "-".repeat(w)).join("  "), ...rows.slice(1).map(line)].join("\n");
}
