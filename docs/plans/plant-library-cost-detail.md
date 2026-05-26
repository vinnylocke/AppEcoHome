# Plan — Plant Library: new model cascade + per-model cost breakdown

## Goal

Three changes:
1. Update the Gemini cascade order to the new 7-model list.
2. Track per-model + per-token-type usage on every run (not just aggregates).
3. Admin UI: expandable run rows showing fresh / cached / output / thinking-token breakdown with costs, per-model mini-cards, plus a static pricing reference table at the bottom of the page.

## App-reference consulted

- [07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md) — admin surface, cost columns
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — cascade definition
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `seed-plant-library` + `verify-plant-library` cost tracking

## 1. New cascade order

In `supabase/functions/_shared/gemini.ts`, replace the existing 6-model cascade with:

```ts
const CASCADE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
];
```

Cheapest → most capable, as today. Cascade behaviour unchanged.

## 2. Pricing table

In `supabase/functions/_shared/geminiCost.ts`, replace the `PRICES` table with the **confirmed Google pricing** (per million tokens, USD, paid tier — these are what you'd be billed if you weren't on the free tier):

| Model | Input | Cached input | Output |
|-------|-------|--------------|--------|
| gemini-2.5-flash-lite | $0.10 | $0.01 | $0.40 |
| gemini-2.5-flash-lite-preview-09-2025 | $0.10 | $0.01 | $0.40 |
| gemini-2.5-flash | $0.30 | $0.03 | $2.50 |
| gemini-3-flash-preview | $0.50 | $0.05 | $3.00 |
| gemini-3.1-flash-lite-preview | $0.25 | $0.025 | $1.50 |
| gemini-3.1-flash-lite | $0.25 | $0.025 | $1.50 |
| gemini-3.5-flash | $1.50 | $0.15 | $9.00 |

**Notable changes from the old PRICES table:**
- Cache discount is now consistently **10%** of input (not 25% as my old default). I'll update the `cacheRate` default in `geminiCost.ts` to `input × 0.10`.
- `gemini-3.5-flash` is much more expensive than the old table assumed — $1.50/$9.00 puts it at the top of the cascade by cost (5× Pro at the input side). Worth knowing because if our cheap-first cascade falls all the way down to it on a flaky batch, that batch's cost jumps materially.
- `gemini-3.1-flash-lite` is 3.3× the old estimate ($0.25 vs $0.075).

**UI note:** the "est. cost" column shows what the run **would have cost** on the paid tier. On the free tier you pay nothing — just rate limits. We'll add a small caption above the runs table making this clear.

## 3. Per-model usage tracking

**New migration:** `supabase/migrations/20260624002000_plant_library_runs_model_usage.sql`

```sql
ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS model_usage jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.plant_library_runs.model_usage IS
  'Per-model token + cost breakdown for the run. Keyed by model id. Each value: { prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens, cost_usd, call_count }.';
```

Shape:
```json
{
  "gemini-2.5-flash-lite": {
    "prompt_tokens": 9200,
    "candidates_tokens": 1100,
    "cached_tokens": 2150,
    "thoughts_tokens": 0,
    "cost_usd": 0.00237,
    "call_count": 3
  },
  "gemini-2.5-flash": { ... }
}
```

Aggregate columns stay — they're used by the totals strip + we don't want to recompute on every render.

## 4. Edge function changes

In `updateRunProgress` (both `seed-plant-library/index.ts` and `verify-plant-library/index.ts`), add a `model` field to the deltas. When a delta has a model, also bump `model_usage[model]`:

```ts
if (deltas.model) {
  const usage = (row.model_usage as Record<string, ModelUsage>) ?? {};
  const slot = usage[deltas.model] ?? {
    prompt_tokens: 0, candidates_tokens: 0, cached_tokens: 0,
    thoughts_tokens: 0, cost_usd: 0, call_count: 0,
  };
  slot.prompt_tokens     += deltas.promptTokens ?? 0;
  slot.candidates_tokens += deltas.candidatesTokens ?? 0;
  slot.cached_tokens     += deltas.cachedTokens ?? 0;
  slot.thoughts_tokens   += deltas.thoughtsTokens ?? 0;
  slot.cost_usd          += deltas.costUsd ?? 0;
  slot.call_count        += 1;
  usage[deltas.model] = slot;
  patch.model_usage = usage;
}
```

Pull `model` from the `usage.model` we already get back from `callGeminiCascade`.

## 5. Admin UI — expandable rows

Each row in Recent runs gets a chevron toggle.

**Collapsed (today's view):** kind · requested · inserted · skipped · matched · amended · failed · duration · status · tokens · est. cost.

**Expanded** (rendered as a sub-row spanning all columns):

**Token-type breakdown** (aggregate across all models used in the run, derived client-side from `model_usage`):

```
┌──────────────────────────────────────────────────────┐
│ Fresh input    9,200 tokens · $0.00092               │
│ Cached input   2,150 tokens · $0.000054              │
│ Output         1,100 tokens · $0.00440               │
│ Thinking           0 tokens · —                      │
│ ─────────────────────────────────────                │
│ Total                                $0.00537        │
└──────────────────────────────────────────────────────┘
```

**Per-model breakdown** (one mini-card per model that contributed):

```
┌─ gemini-2.5-flash-lite · 3 calls · $0.00237 ─────────┐
│ Fresh input  6,900 × $0.10/M  = $0.00069             │
│ Cached       1,500 × $0.025/M = $0.0000375           │
│ Output         900 × $0.40/M  = $0.00036             │
│ Thinking         0 × $0.40/M  = $0.0                 │
└──────────────────────────────────────────────────────┘
┌─ gemini-2.5-flash · 1 call · $0.00300 ───────────────┐
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

## 6. Pricing reference table at page bottom

A static section under Recent runs:

```
┌─ Gemini model pricing (per 1M tokens) ───────────────┐
│ Model                                   Input  Cache  Output │
│ gemini-2.5-flash-lite                   $0.10  $0.025  $0.40 │
│ gemini-2.5-flash-lite-preview-09-2025   $0.10  $0.025  $0.40 │
│ gemini-2.5-flash                        $0.30  $0.075  $2.50 │
│ gemini-3-flash-preview                  $0.50  $0.125  $4.00 │
│ gemini-3.1-flash-lite-preview           $0.075 $0.019  $0.30 │
│ gemini-3.1-flash-lite                   $0.075 $0.019  $0.30 │
│ gemini-3.5-flash                        $0.30  $0.075  $2.50 │
└──────────────────────────────────────────────────────────────┘
```

Pulls from a new client-side mirror `src/lib/geminiPricing.ts` (single source of truth for the UI). The Deno-side `geminiCost.ts` stays the cost authority for actual writes; the client mirror is read-only and used for the reference table + expanded-row math.

## 7. Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/gemini.ts` | Cascade order |
| `supabase/functions/_shared/geminiCost.ts` | New PRICES entries |
| `supabase/migrations/20260624002000_plant_library_runs_model_usage.sql` | New `model_usage` column |
| `supabase/functions/seed-plant-library/index.ts` | Pass `model` to `updateRunProgress`; bump per-model bucket |
| `supabase/functions/verify-plant-library/index.ts` | Same |
| `src/lib/geminiPricing.ts` (new) | Client-side mirror of PRICES for the UI |
| `src/services/plantLibraryAdminService.ts` | Surface `model_usage` on the Run type |
| `src/components/admin/PlantLibraryAdmin.tsx` | Expandable rows + reference table |

## 8. App-reference updates

- `07-management/10-plant-library-admin.md` — expandable rows + new reference section
- `99-cross-cutting/13-ai-gemini.md` — new cascade order + updated pricing table

## 9. Sequencing

1. Update gemini.ts cascade.
2. Update geminiCost.ts PRICES (with the figures you confirm).
3. Write + apply migration locally.
4. Update edge fns to bucket per-model.
5. Add client-side pricing mirror.
6. Admin UI: expandable rows + pricing table.
7. Update app-reference docs.
8. Typecheck Deno + TS.
9. Deploy `--bump 1` (includes migration push).

## 10. Backwards compat

Existing rows have `model_usage = '{}'`. Expanded view for old rows shows "No per-model data — pre-12.0058 run". No data migration needed (the aggregate cost columns are still there for historical rows).
