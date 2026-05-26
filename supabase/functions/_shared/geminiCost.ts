// Gemini API pricing per million tokens (USD).
//
// Confirmed against https://ai.google.dev/gemini-api/docs/pricing —
// update when Google publishes new rates. The `total_cost_usd` column
// on `plant_library_runs` stores whatever this table said when the
// call happened, so historical rows stay representative even after
// rate changes.
//
// Order in the table mirrors the cascade order in `gemini.ts`:
// cheapest first, most capable / most expensive last.
//
// Three rates per model:
//   input  — fresh prompt tokens (not from cache).
//   cache  — prompt tokens served from Google's context cache.
//            Consistently 10% of input across the current Gemini
//            range; PRICES entries set it explicitly so a future
//            anomaly doesn't get silently averaged into the default.
//   output — response tokens; ALSO charged for "thoughts" / reasoning
//            tokens at the same rate.

interface ModelRate {
  input: number;
  output: number;
  /** Optional. Defaults to input × 0.10 when omitted. */
  cache?: number;
}

const PRICES: Record<string, ModelRate> = {
  // ── Flash tier (default cascade for high-volume / text-heavy work) ──
  "gemini-2.5-flash-lite":                  { input: 0.10,  cache: 0.01,   output: 0.40 },
  "gemini-2.5-flash-lite-preview-09-2025":  { input: 0.10,  cache: 0.01,   output: 0.40 },
  "gemini-2.5-flash":                       { input: 0.30,  cache: 0.03,   output: 2.50 },
  "gemini-3-flash-preview":                 { input: 0.50,  cache: 0.05,   output: 3.00 },
  "gemini-3.1-flash-lite-preview":          { input: 0.25,  cache: 0.025,  output: 1.50 },
  "gemini-3.1-flash-lite":                  { input: 0.25,  cache: 0.025,  output: 1.50 },
  "gemini-3.5-flash":                       { input: 1.50,  cache: 0.15,   output: 9.00 },
  // ── Pro tier (vision-heavy actions — plant doctor diagnose / pest /
  // identify / analyse). Rates per ≤200k context window; the larger
  // bracket exists but we never approach it for image+JSON payloads. ──
  "gemini-2.5-pro":                         { input: 1.25,  cache: 0.125,  output: 10.00 },
  "gemini-3.1-pro-preview":                 { input: 2.00,  cache: 0.20,   output: 12.00 },
};

/**
 * Read-only export so the admin UI can render a pricing reference
 * table sourced from the same numbers used for billing math. Kept in
 * Deno-land for the auth — the client mirrors this in
 * `src/lib/geminiPricing.ts` (manually kept in sync, both are tiny).
 */
export const GEMINI_PRICES: Readonly<Record<string, Readonly<ModelRate>>> = PRICES;

// ── Imagen image-generation pricing ────────────────────────────────
//
// Per-image flat rate, no token-based math. Used by the garden-
// overhaul flow's concept-image generation. Confirmed against
// https://ai.google.dev/gemini-api/docs/pricing — paid tier only.

const IMAGEN_PRICES: Record<string, number> = {
  "imagen-4.0-fast-generate-001":  0.02,
  "imagen-4.0-generate-001":       0.04,
  "imagen-4.0-ultra-generate-001": 0.06,
  // Multimodal image generation — accepts a reference photo + text
  // prompt and TRANSFORMS the input. Used by Garden Overhaul so
  // concept images keep continuity with the user's actual garden
  // (Imagen 4 is text-to-image only and produces generic mockups).
  "gemini-2.5-flash-image":        0.039,
};

export const IMAGEN_PRICING: Readonly<Record<string, number>> = IMAGEN_PRICES;

/**
 * Per-image USD cost for an Imagen model. Returns 0 for unknown
 * models (defensive — don't throw + lose the rest of an
 * audit-tracking call).
 */
export function estimateImagenCostUsd(
  model: string,
  imageCount: number,
): number {
  const perImage = IMAGEN_PRICES[model];
  if (perImage === undefined) return 0;
  return perImage * Math.max(0, imageCount);
}

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
  opts: { batch?: boolean } = {},
): number {
  const rate = PRICES[model];
  if (!rate) return 0;
  // Batch API is 50% of standard across input, cache and output.
  const discount = opts.batch ? 0.5 : 1;
  const cacheRate = (rate.cache ?? rate.input * 0.10) * discount;

  const cached = usage.cachedContentTokenCount ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? 0;
  const freshInput = Math.max(0, usage.promptTokenCount - cached);

  const inputRate  = rate.input  * discount;
  const outputRate = rate.output * discount;

  const freshCost  = (freshInput / 1_000_000) * inputRate;
  const cacheCost  = (cached     / 1_000_000) * cacheRate;
  const outputCost = ((usage.candidatesTokenCount + thoughts) / 1_000_000) * outputRate;

  return freshCost + cacheCost + outputCost;
}
