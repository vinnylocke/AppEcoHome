// Approximate Gemini API pricing per million tokens (USD).
//
// These are estimates based on Google's published rates at the time
// of writing — update when Google publishes new pricing. The
// `total_cost_usd` column on `plant_library_runs` will reflect
// whatever this table says when the call happened, so historical
// run rows stay accurate even if we change rates later.
//
// Order in the table mirrors the cascade order in `gemini.ts`:
// cheapest first, most capable last.

interface ModelRate {
  /** USD per million prompt (input) tokens. */
  input: number;
  /** USD per million candidate (output) tokens. */
  output: number;
}

const PRICES: Record<string, ModelRate> = {
  "gemini-3.1-flash-lite":  { input: 0.075, output: 0.30 },
  "gemini-2.5-flash-lite":  { input: 0.10,  output: 0.40 },
  "gemini-2.5-flash":       { input: 0.30,  output: 2.50 },
  "gemini-3-flash-preview": { input: 0.50,  output: 4.00 },
  "gemini-2.5-pro":         { input: 1.25,  output: 5.00 },
  "gemini-3.1-pro-preview": { input: 2.50,  output: 10.00 },
};

/**
 * Estimate the USD cost of a Gemini call from its token counts and
 * the model that served it. Returns 0 when the model isn't in the
 * price table (defensive — we don't want to throw on an unknown
 * model and lose the rest of the run's tracking).
 */
export function estimateGeminiCostUsd(
  model: string,
  promptTokens: number,
  candidatesTokens: number,
): number {
  const rate = PRICES[model];
  if (!rate) return 0;
  const inputCost = (promptTokens / 1_000_000) * rate.input;
  const outputCost = (candidatesTokens / 1_000_000) * rate.output;
  return inputCost + outputCost;
}
