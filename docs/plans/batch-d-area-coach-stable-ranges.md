# Plan — Batch D (#3): Area Coach stable plant ranges from the library

## Problem
The AI Area Coach's per-plant moisture/EC/soil-temp targets drift between runs (e.g.
"strawberry requirements keep changing"). The stable-metadata infra is **already built**:
- `plants` + `plant_library` have `soil_moisture_min/max`, `soil_ec_min/max`,
  `soil_temp_min/max` (migration `20260729000000`, in prod).
- `area-sensor-analysis` reads `plants.soil_*` and the prompt
  (`areaAnalysisPrompt.ts:277`) already marks stored ranges as **authoritative**.

**The gap:** nothing populates `plants.soil_*` (only the seeder fills `plant_library`).
So those columns are NULL for users' plants → the prompt's "no stored range → estimate"
path runs every time → drift. `plant_library` *is* seeded with these ranges and is
matchable by `scientific_name_key` (generated, indexed) / `common_name`.

## App-reference consulted
- [`99-cross-cutting/03-data-model-plants.md`](../app-reference/99-cross-cutting/03-data-model-plants.md)
- [`99-cross-cutting/25-plant-providers.md`](../app-reference/99-cross-cutting/25-plant-providers.md)
- [`99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md)
- [`03-garden-hub/03-location-manager.md`](../app-reference/03-garden-hub/03-location-manager.md) (Area Coach surface)
- existing [`docs/plans/plant-care-metadata.md`](./plant-care-metadata.md)

## Approach — enrich from the library (no migration)

`area-sensor-analysis` already loads each area plant's `plants` row (incl.
`scientific_name`/`common_name`). Add: when a plant's `plants.soil_*` ranges are NULL,
**fill them from the matching `plant_library` row** (the seeded, stable ground truth).
Result: any library-covered plant gets a fixed range every run → no drift. Graceful
fallback chain per metric: `plants.soil_*` → `plant_library.soil_*` → model estimate.

1. **`area-sensor-analysis/index.ts`**:
   - Select `scientific_name, common_name` alongside the existing `plants` care columns.
   - Build a lookup key per plant: lowercased first scientific name, else common_name
     (mirrors `plant_library.scientific_name_key`).
   - One query: `plant_library` `select(scientific_name_key, common_name, soil_moisture_min/max, soil_ec_min/max, soil_temp_min/max)` `.in("scientific_name_key", keys)` (+ a `common_name ilike` fallback for plants with no scientific name).
   - Merge with a pure helper (`plants` value wins; library fills each NULL).
2. **New pure helper `supabase/functions/_shared/careRanges.ts`** —
   `mergeCareRanges(plantsRow, libraryRow)` returning the resolved
   moisture/EC/temp/pH min-max (per-field coalesce). Deno-tested.
3. Prompt unchanged — it already treats provided ranges as authoritative and only
   estimates per-metric gaps.

### Out of scope (noted)
- Persisting ranges back onto `plants.soil_*` (so non-library plants get covered, and to
  avoid the per-run library join) — a durability follow-up: teach the AI plant care
  generator (`refreshStaleAiPlants` + initial AI create) to emit + write the ranges.
  The library-enrichment above already fixes the user-visible drift for covered plants, so
  this is deferred.

## Files
| File | Change |
|------|--------|
| `supabase/functions/_shared/careRanges.ts` (new) | pure per-field merge helper |
| `supabase/tests/careRanges.test.ts` (new) | Deno tests |
| `supabase/functions/area-sensor-analysis/index.ts` | select name keys, query `plant_library`, merge |
| `docs/app-reference/.../03-location-manager.md` + `03-data-model-plants.md` | note library-sourced ranges |
| `docs/plans/plant-care-metadata.md` | mark population gap closed via library enrichment |

## Tests
- Deno: `mergeCareRanges` — plants-wins, library-fills-nulls, both-null → null,
  partial coverage.
- `tsc`/`build` unaffected (edge-function only); `test:functions` green.
- Manual: regenerate an area with a library-covered plant twice → identical ranges.

## Risks
- **Library coverage** — if a plant isn't in `plant_library`, it still estimates (current
  behaviour); no regression. The seeder backfills the library over time.
- **Match accuracy** — key on `scientific_name_key` first (precise); `common_name`
  fallback is case-insensitive exact to avoid mis-matches.
- No schema/data change → deploy is just the edge function (no migration, no db push).

## Deploy
`supabase functions deploy area-sensor-analysis` + `deploy-app-only` (docs/release-notes)
→ commit + push. No migration.
