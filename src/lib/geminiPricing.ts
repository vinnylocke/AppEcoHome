// Client-side mirror of `supabase/functions/_shared/geminiCost.ts`'s
// PRICES table. The Deno-side table is the billing-math authority
// (writes `total_cost_usd` + `model_usage.*.cost_usd` on every run
// row); this mirror exists so the admin UI can render a pricing
// reference table + per-token-type cost breakdowns without round-trip
// to an edge function.
//
// KEEP THESE TWO TABLES IN SYNC. Both pull from
// https://ai.google.dev/gemini-api/docs/pricing — update both at the
// same time when Google publishes new rates.

export interface GeminiModelRate {
  /** USD per million fresh input tokens. */
  input: number;
  /** USD per million cached input tokens. */
  cache: number;
  /** USD per million output tokens (also charged for "thoughts" tokens). */
  output: number;
}

/** Confirmed against Google's pricing page on 2026-05-24. */
export const GEMINI_PRICES: Readonly<Record<string, GeminiModelRate>> = {
  // Flash tier — default cascade for high-volume / text-heavy work
  "gemini-2.5-flash-lite":                  { input: 0.10,  cache: 0.01,   output: 0.40 },
  "gemini-2.5-flash-lite-preview-09-2025":  { input: 0.10,  cache: 0.01,   output: 0.40 },
  "gemini-2.5-flash":                       { input: 0.30,  cache: 0.03,   output: 2.50 },
  "gemini-3-flash-preview":                 { input: 0.50,  cache: 0.05,   output: 3.00 },
  "gemini-3.1-flash-lite-preview":          { input: 0.25,  cache: 0.025,  output: 1.50 },
  "gemini-3.1-flash-lite":                  { input: 0.25,  cache: 0.025,  output: 1.50 },
  "gemini-3.5-flash":                       { input: 1.50,  cache: 0.15,   output: 9.00 },
  // Pro tier — vision-heavy plant doctor actions (diagnose / pest /
  // identify / analyse). Rates per ≤200k context window.
  "gemini-2.5-pro":                         { input: 1.25,  cache: 0.125,  output: 10.00 },
  "gemini-3.1-pro-preview":                 { input: 2.00,  cache: 0.20,   output: 12.00 },
};

/**
 * Compute the cost breakdown for a single per-model usage slot. The
 * "fresh input" portion is whatever's left over after cached tokens
 * are accounted for. Returns USD figures.
 */
export interface CostBreakdown {
  fresh_input_tokens: number;
  fresh_input_cost: number;
  cached_input_tokens: number;
  cached_input_cost: number;
  output_tokens: number;
  output_cost: number;
  thinking_tokens: number;
  thinking_cost: number;
  total_cost: number;
}

export function breakdownModelCost(
  model: string,
  usage: {
    prompt_tokens: number;
    candidates_tokens: number;
    cached_tokens: number;
    thoughts_tokens: number;
  },
): CostBreakdown {
  const rate = GEMINI_PRICES[model];
  // Unknown model — return tokens but zero-cost rather than fabricate
  // a price. UI shows it as "(unknown model)".
  const inputRate  = rate?.input  ?? 0;
  const cacheRate  = rate?.cache  ?? 0;
  const outputRate = rate?.output ?? 0;

  const fresh_input_tokens  = Math.max(0, usage.prompt_tokens - usage.cached_tokens);
  const cached_input_tokens = usage.cached_tokens;
  const output_tokens       = usage.candidates_tokens;
  const thinking_tokens     = usage.thoughts_tokens;

  const fresh_input_cost  = (fresh_input_tokens  / 1_000_000) * inputRate;
  const cached_input_cost = (cached_input_tokens / 1_000_000) * cacheRate;
  const output_cost       = (output_tokens       / 1_000_000) * outputRate;
  // Thinking tokens are billed at the output rate per Google's docs.
  const thinking_cost     = (thinking_tokens     / 1_000_000) * outputRate;

  return {
    fresh_input_tokens,
    fresh_input_cost,
    cached_input_tokens,
    cached_input_cost,
    output_tokens,
    output_cost,
    thinking_tokens,
    thinking_cost,
    total_cost: fresh_input_cost + cached_input_cost + output_cost + thinking_cost,
  };
}

/** Format a USD cost — sub-cent figures get 6 decimals, larger ones 4. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.001) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

// ── Imagen image-generation pricing (per image, USD) ───────────────
//
// Mirror of `IMAGEN_PRICING` in `supabase/functions/_shared/geminiCost.ts`.
// Keep in sync when Google publishes new rates.

export const IMAGEN_PRICING: Readonly<Record<string, number>> = {
  "imagen-4.0-fast-generate-001":  0.02,
  "imagen-4.0-generate-001":       0.04,
  "imagen-4.0-ultra-generate-001": 0.06,
  "gemini-2.5-flash-image":        0.039,
};
