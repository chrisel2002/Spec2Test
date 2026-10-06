// Best-effort cost estimate for agent_runs.cost_usd. We run on Gemini's
// free tier (today's actual bill is $0), so this is notional — "what this
// would cost on a paid plan" — rather than a real charge, and rates will
// drift as providers change pricing. Update this table if that happens, or
// when a new model is added to MODEL_NAME.
const PRICING_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "gemini-flash-latest": { input: 0.075, output: 0.3 },
  "gemini-2.5-flash": { input: 0.075, output: 0.3 },
};

export function estimateCostUsd(
  modelName: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const pricing = PRICING_PER_MILLION_TOKENS[modelName];
  if (!pricing) return 0;

  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  );
}
