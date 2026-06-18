# Plan — Area Coach persists generated care ranges (deferred #3 durability)

## Goal
When a plant has no stored moisture/EC/soil-temp ranges (not on `plants`, not in
`plant_library`), the AI Area Coach should **generate them once and save them to the
global `plants` row**, so the same plant is never re-generated — for this user or any
other. `plants` is a shared catalogue (integer PK, no home_id, public read / authenticated
write), so saving there benefits everyone.

## Current state
`area-sensor-analysis` (Batch D) resolves ranges via `plants.soil_*` → `plant_library`
→ else the area-insight model estimates inline and **discards** the estimate → drift +
no sharing.

## Approach
1. **New `_shared/plantCareRangeGen.ts`** (pure-ish):
   - `CARE_RANGE_SCHEMA` (6 numeric fields) + `buildPlantCareRangePrompt({common_name, scientific_name})` + `parseCareRangeResponse(text)` (tolerant via `extractJson`).
2. **`area-sensor-analysis/index.ts`**: after merging `plants`+library ranges, find plants
   still missing the key metrics (moisture & EC & temp all null), **capped at 3 per run**.
   For each: one focused Gemini call → `parseCareRangeResponse` → `UPDATE plants.soil_*`
   (global) → merge into `careById` so the **current** insight is already stable. Logged
   via `logAiUsage` (`action: care_range_backfill`). Wrapped in try/catch — never blocks
   the insight. Only runs on a cache-miss regeneration, so steady-state cost is zero once a
   plant is learned.
3. No migration (columns exist; `plants` is writable). No client change.

## Files
| File | Change |
|------|--------|
| `supabase/functions/_shared/plantCareRangeGen.ts` (new) | prompt + schema + parser |
| `supabase/tests/plantCareRangeGen.test.ts` (new) | Deno tests (parser, prompt) |
| `supabase/functions/area-sensor-analysis/index.ts` | generate + persist + merge missing |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | note the write-back closes the loop |
| `docs/plans/plant-care-metadata.md` / `batch-d-…md` | mark durability follow-up done |

## Tests
- Deno: `parseCareRangeResponse` (valid JSON, fenced JSON, all-null → null, partial);
  `buildPlantCareRangePrompt` includes the name. `test:functions` green.

## Risks
- **Cost** — bounded: cap 3/run, only on regeneration, only for unknown plants, written
  once globally. A plant whose AI returns all-null isn't written → may retry later (rare;
  bounded by the analysis cache cadence).
- **Quality** — focused agronomic prompt mirrors the library seeder's wording; values are
  ranges not exact, consistent with the library.
- **Concurrency** — two areas learning the same plant at once = one-off double call, then
  saved. Harmless (last write wins, same data).

## Deploy
`supabase functions deploy area-sensor-analysis` + `deploy-app-only` → commit + push. No migration.
