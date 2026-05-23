# Plan — capture full Gemini usage + closer-to-accurate cost

## Change

1. **Expand `GeminiUsage`** to carry the two extra fields Gemini's `usageMetadata` returns: `cachedContentTokenCount` (prompt tokens served from context cache, billed at ~25% of normal input) and `thoughtsTokenCount` (Pro-model thinking, billed as output). Both default to 0 when absent.

2. **`callOnce`** in `_shared/gemini.ts` extracts them from `data.usageMetadata` the same way it extracts the three existing fields.

3. **`estimateGeminiCostUsd`** changes signature from positional `(model, prompt, candidates)` to a usage-object form, computes:
   - `fresh_input = (promptTokens - cachedTokens) × inputRate`
   - `cache_input = cachedTokens × inputRate × 0.25`   *(Google's standard cache discount)*
   - `output = (candidatesTokens + thoughtsTokens) × outputRate`
   - Total = sum.

4. **Migration** adds two columns to `plant_library_runs`:
   - `total_cached_tokens int` — sum of `cachedContentTokenCount` per call
   - `total_thoughts_tokens int` — sum of `thoughtsTokenCount` per call

   These let the admin audit where the cost came from (heavy thinking? lots of cache hits?). Not required for cost calc itself — that uses the per-call breakdown — but useful for visibility.

5. **Seed + verify functions** pass the full usage breakdown into `updateRunProgress` so the new columns accumulate alongside the existing token totals.

6. **Service type** gains the two new fields; admin UI shows the cost label as "**est. cost**" so it's clear it's not an invoice line item.

## Out of scope

- Pulling from GCP Billing API (Route B in the discussion). Not needed for an internal cost meter.
- Per-model tiered pricing for >128k context windows. Library batches never approach 128k input so this doesn't matter today; would need attention if we start using long-context calls elsewhere.

## Files

| File | Change |
|------|---------|
| `supabase/functions/_shared/gemini.ts` | Extend `GeminiUsage`, capture 2 extra fields |
| `supabase/functions/_shared/geminiCost.ts` | New `estimateGeminiCostUsd(model, usage)` signature with cache + thinking accounting |
| `supabase/migrations/<ts>_plant_library_runs_token_breakdown.sql` | Add `total_cached_tokens` + `total_thoughts_tokens` columns |
| `supabase/functions/seed-plant-library/index.ts` | Pass usage breakdown, update call signature |
| `supabase/functions/verify-plant-library/index.ts` | Same |
| `src/services/plantLibraryAdminService.ts` | Add fields to `PlantLibraryRun` type |
| `src/components/admin/PlantLibraryAdmin.tsx` | Label cost as "est." in stats + table headers |

## Sequencing

Migration locally → edge fn changes → admin UI → typecheck → deploy.
