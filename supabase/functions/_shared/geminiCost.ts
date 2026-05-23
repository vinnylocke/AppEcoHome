// Approximate Gemini API pricing per million tokens (USD).
//
// These are estimates based on Google's published pay-as-you-go
// rates at the time of writing — update when Google publishes new
// pricing. The `total_cost_usd` column on `plant_library_runs`
// stores whatever this table said when the call happened, so
// historical rows stay representative even after rate changes.
//
// Order in the table mirrors the cascade order in `gemini.ts`:
// cheapest first, most capable last.
//
// Three rates per model:
//   input  — fresh prompt tokens (not from cache).
//   output — response tokens; ALSO charged for reasoning ("thoughts")
//            tokens on Pro models.
//   cache  — prompt tokens served from Google's context cache.
//            Defaults to input × 0.25 when not specified — that's
//            Google's standard discount as of writing.

interface ModelRate {
  input: number;
  output: number;
  /** Optional. Defaults to input × 0.25. */
  cache?: number;
}

const PRICES: Record<string, ModelRate> = {
  "gemini-3.1-flash-lite":  { input: 0.075, output: 0.30 },
  "gemini-2.5-flash-lite":  { input: 0.10,  output: 0.40 },
  "gemini-2.5-flash":       { input: 0.30,  output: 2.50 },
  "gemini-3-flash-preview": { input: 0.50,  output: 4.00 },
  "gemini-2.5-pro":         { input: 1.25,  output: 5.00 },
  "gemini-3.1-pro-preview": { input: 2.50,  output: 10.00 },
};

export interface CostUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

/**
 * Estimate the USD cost of a Gemini call using the full token
 * breakdown Gemini returns in `usageMetadata`. Returns 0 when the
 * model isn't in the price table (defensive — we don't want to
 * throw on an unknown model and lose the rest of the run's
 * tracking).
 *
 * Cost formula:
 *   fresh_input = (promptTokens - cachedTokens) × inputRate
 *   cache_input = cachedTokens × cacheRate
 *   output      = (candidatesTokens + thoughtsTokens) × outputRate
 *
 * `promptTokenCount` includes cached tokens in Gemini's response,
 * so we subtract them before applying the input rate; the cached
 * tokens are then billed at the discounted cache rate.
 *
 * `thoughtsTokenCount` is added to candidates because Google bills
 * reasoning tokens at the model's output rate (not free).
 */
export function estimateGeminiCostUsd(
  model: string,
  usage: CostUsage,
): number {
  const rate = PRICES[model];
  if (!rate) return 0;
  const cacheRate = rate.cache ?? rate.input * 0.25;

  const cached = usage.cachedContentTokenCount ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? 0;
  const freshInput = Math.max(0, usage.promptTokenCount - cached);

  const freshCost  = (freshInput / 1_000_000) * rate.input;
  const cacheCost  = (cached     / 1_000_000) * cacheRate;
  const outputCost = ((usage.candidatesTokenCount + thoughts) / 1_000_000) * rate.output;

  return freshCost + cacheCost + outputCost;
}
