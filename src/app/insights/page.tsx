import { ArrowLeft, CheckCircle2, FlaskConical, Pencil, XCircle } from "lucide-react";
import Link from "next/link";

import { CostChart } from "@/components/insights/cost-chart";
import { COST_STEPS, STEP_LABELS } from "@/lib/insights/aggregate";
import { formatUsd } from "@/lib/runs/selectors";
import { getInsights } from "@/lib/services/insights";

// Imported, not read from disk at request time: the newest real eval
// result per spec is bundled into the build, so the page works the same
// when deployed, where the repo's files aren't on the server.
import latestEvalJson from "../../../evals/results/latest.json";
import { EvalResultSchema, formatRatio, METRIC_LABELS, type Metrics } from "../../../evals/lib/results";

export const dynamic = "force-dynamic";

const latestEval = EvalResultSchema.parse(latestEvalJson);

function Section({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function seconds(ms: number) {
  return ms < 100 ? "<0.1 s" : `${(ms / 1000).toFixed(1)} s`;
}

export default async function InsightsPage() {
  const { costs, durations, reviews } = await getInsights();
  const totalCost = costs.reduce((sum, run) => sum + run.costUsd, 0);
  const totalTokens = costs.reduce((sum, run) => sum + run.tokens, 0);
  const longest = Math.max(...durations.map((d) => d.averageMs), 1);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
        <span className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-5 text-emerald-600" aria-hidden />
          Spec2Test
        </span>
        <Link href="/" className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Back to workspace
        </Link>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            What the agent costs, where its time goes, how it scores against the golden dataset, and how
            often reviewers keep what it writes.
          </p>
        </div>

        <Section
          title="Cost and tokens per run"
          description={`Estimated cost of the last ${costs.length} runs, split by agent step, at the model's paid-tier rates. Hover a column for its tokens.`}
        >
          {costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Runs" value={String(costs.length)} />
                <Stat label="Total est. cost" value={formatUsd(totalCost)} />
                <Stat label="Total tokens" value={totalTokens.toLocaleString("en")} />
              </div>
              <CostChart runs={costs} />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Table view</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs tabular-nums">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Run</th>
                        {COST_STEPS.map((step) => (
                          <th key={step} className="py-1 pr-3 text-right font-medium">{STEP_LABELS[step]}</th>
                        ))}
                        <th className="py-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((run) => (
                        <tr key={run.runId} className="border-t">
                          <td className="py-1 pr-3">
                            {run.filename} · {new Date(run.createdAt).toLocaleDateString("en")}
                          </td>
                          {COST_STEPS.map((step) => (
                            <td key={step} className="py-1 pr-3 text-right">
                              {run.steps[step].tokens.toLocaleString("en")} tok · {formatUsd(run.steps[step].costUsd)}
                            </td>
                          ))}
                          <td className="py-1 text-right font-medium">
                            {run.tokens.toLocaleString("en")} tok · {formatUsd(run.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </Section>

        <Section title="Average run time per step" description="Wall-clock time of successful step attempts, including waits for rate limits.">
          {durations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed steps yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {durations.map((d) => (
                <li key={d.step} className="grid grid-cols-[10rem_1fr] items-center gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{STEP_LABELS[d.step]}</span>
                  <span className="flex items-center gap-2" title={`${d.samples} successful attempts`}>
                    <span
                      className="h-4 rounded-r-[4px]"
                      style={{ width: `${(d.averageMs / longest) * 85}%`, minWidth: 2, background: "var(--chart-series-1)" }}
                    />
                    <span className="tabular-nums">{seconds(d.averageMs)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Latest eval results"
          description={
            <>
              The newest real-model run of <code>pnpm eval</code> per sample spec, scored against the golden
              dataset in <code>evals/golden/</code> ({latestEval.model.name}, prompts {latestEval.promptVersion}).
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-4 font-medium">Metric</th>
                  {latestEval.specs.map((spec) => (
                    <th key={spec.spec} className="py-1.5 pr-4 text-right font-medium">{spec.spec}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(METRIC_LABELS) as (keyof Metrics)[]).map((key) => (
                  <tr key={key} className="border-t">
                    <td className="py-1.5 pr-4">{METRIC_LABELS[key]}</td>
                    {latestEval.specs.map((spec) => (
                      <td key={spec.spec} className="py-1.5 pr-4 text-right">{formatRatio(spec.metrics?.[key])}</td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t text-muted-foreground">
                  <td className="py-1.5 pr-4">Tokens · est. cost · run time</td>
                  {latestEval.specs.map((spec) => (
                    <td key={spec.spec} className="py-1.5 pr-4 text-right">
                      {spec.usage.totalTokens.toLocaleString("en")} · {formatUsd(spec.costUsd)} · {seconds(spec.durationMs)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Review outcomes"
          description="What reviewers did with the tests the agent generated, across all runs."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Approved as generated" value={String(reviews.approvedAsGenerated)} icon={<CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />} />
            <Stat label="Approved after edit" value={String(reviews.approvedAfterEdit)} icon={<Pencil className="size-3.5" aria-hidden />} />
            <Stat label="Rejected" value={String(reviews.rejected)} icon={<XCircle className="size-3.5 text-red-600" aria-hidden />} />
            <Stat label="Not reviewed yet" value={String(reviews.notReviewed)} />
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-sm text-muted-foreground">Approval rate</p>
            <p className="text-3xl font-semibold tabular-nums">{formatRatio(reviews.approvalRate)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatRatio(reviews.acceptedAsIsRate)} kept without changing a word, of {reviews.reviewed} reviewed tests.
            </p>
            <p className="mt-3 max-w-2xl text-sm">
              The approval rate is the share of reviewed tests a person kept. It&rsquo;s a useful real-world
              quality signal because it comes from real reviews of real specs, not from the golden dataset:
              if it drops after a prompt or model change, the agent got worse at something the evals
              don&rsquo;t cover. The share kept without edits is the stricter measure: an edited test was
              useful but not right.
            </p>
          </div>
        </Section>
      </main>
    </div>
  );
}
