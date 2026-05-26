# Plan — Plant Doctor: Pro-model vision cascade

## Goal

Route the 4 vision-heavy plant-doctor actions through a dedicated cascade led by Pro models (much better at visual reasoning) instead of the default Flash cascade. Other actions stay on Flash.

## App-reference consulted

- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md)
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)

## Changes

### 1. Add Pro models to PRICES tables

Per confirmed Google pricing (≤200k context):

| Model | Input | Cached | Output |
|-------|-------|--------|--------|
| gemini-2.5-pro | $1.25 | $0.125 | $10.00 |
| gemini-3.1-pro-preview | $2.00 | $0.20 | $12.00 |

Update both:
- `supabase/functions/_shared/geminiCost.ts` (Deno billing authority)
- `src/lib/geminiPricing.ts` (client UI mirror)

### 2. Define vision cascade in `_shared/gemini.ts`

```ts
/** Pro-first cascade for vision-heavy plant doctor actions. Trades
 *  ~20x cost for noticeably better vision reasoning. Falls back
 *  through Flash if Pro is overloaded. */
export const VISION_DIAGNOSIS_MODELS = [
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];
```

### 3. Apply to 4 plant-doctor actions

Add `models: VISION_DIAGNOSIS_MODELS` to the `callGeminiCascade` call inside:
- `diagnose`
- `identify_pest`
- `identify_vision`
- `analyse_comprehensive`

Leave all other plant-doctor actions on the default Flash cascade (text-only).

## Cost impact

Typical diagnose call: ~2k input + ~2k output tokens.
- Flash-lite: ~$0.001
- Pro: ~$0.022 (20× absolute, still $0.02 per call)

At 100 diagnoses/month: $0.10 → $2.20. Negligible. Seed library (where Pro cost would compound) is unaffected — it stays on the Flash cascade.

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/geminiCost.ts` | Add Pro PRICES entries |
| `supabase/functions/_shared/gemini.ts` | Export `VISION_DIAGNOSIS_MODELS` |
| `supabase/functions/plant-doctor/index.ts` | Pass `models: VISION_DIAGNOSIS_MODELS` to 4 vision actions |
| `src/lib/geminiPricing.ts` | Mirror Pro pricing for admin UI |

## App-reference updates

- `05-tools/02-plant-doctor.md` — note the vision cascade for diagnose / pest / identify / analyse
- `99-cross-cutting/13-ai-gemini.md` — add Pro model pricing rows + mention the per-feature cascade override pattern

## Sequencing

1. Add Pro prices both sides.
2. Define cascade.
3. Wire into 4 actions.
4. Docs.
5. Typecheck Deno + TS.
6. Deploy `--bump 1`.
