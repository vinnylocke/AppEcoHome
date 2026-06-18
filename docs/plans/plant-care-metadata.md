# Stable plant care metadata (moisture / EC / soil-temp ranges)

## Problem
The AI Area Coach derives each plant's ideal **moisture / EC / soil-temperature**
ranges via Gemini on every (re)generation, so the numbers drift between runs.
The user wants these stored as **stable plant metadata** in the DB so they don't
constantly change — and so the Coach can reason from ground-truth values.

## Current state (verified)
- `plant_library` + `plants` store `soil_ph_min/max`, `watering_min/max_days`,
  `sunlight`, etc. — but **no** soil-moisture %, EC, or soil-temp range columns.
- `area-sensor-analysis` only reads `plants.soil_ph_min/max`; the moisture/EC/temp
  *targets* in the insight come entirely from the model each time.
- `plant_library` is populated by the AI pipeline (`seed-plant-library`,
  `verify-plant-library`, batches/run-schedules).

## App-reference consulted
- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md),
  [25-plant-providers.md](../app-reference/99-cross-cutting/25-plant-providers.md)
  — plant + plant_library schema, provider/AI fields.
- The Plant Library admin references + [13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md)
  — the seeder/verifier contracts that must learn the new fields.
- [03-garden-hub] Area Coach (`area-sensor-analysis`) — consumer of the new fields.

## Approach
1. **Schema** — add care-range columns to `plant_library` AND `plants`
   (numeric, nullable): `soil_moisture_min/max` (%), `soil_ec_min/max` (µS/cm),
   `soil_temp_min/max` (°C). Grants already exist (existing tables).
2. **Population** — teach the AI plant-library seeder/verifier contracts
   (`_shared` plant-library prompt + JSON schema) to emit these ranges, and map
   them into `plant_library` rows (and the global `plants` AI catalogue rows on
   fork). Back-fill lazily via the existing refresh pipeline (freshness version),
   not a one-shot.
3. **Area Coach** — `area-sensor-analysis` reads each area plant's stored ranges
   and feeds them into the prompt as **authoritative targets**; the prompt is
   adjusted so the model *uses* the provided ranges (status = compare current vs
   stored range) rather than inventing them. When a plant lacks stored ranges,
   fall back to the model's estimate (today's behaviour) — so it degrades, never
   blocks.
4. **Consistency** — because targets now come from the DB, re-analyses with the
   same plants yield the same ranges; only the *status*/advice changes with new
   readings.

## Files
| File | Change |
|------|--------|
| `supabase/migrations/<ts>_plant_care_ranges.sql` (new) | add moisture/ec/temp range columns to `plant_library` + `plants` |
| `supabase/functions/_shared/*plantLibrary*` (seeder/verifier prompt + schema) | emit + validate the new ranges |
| `supabase/functions/seed-plant-library` / `verify-plant-library` | persist the ranges |
| `supabase/functions/area-sensor-analysis/index.ts` | gather stored ranges per plant |
| `supabase/functions/_shared/areaAnalysisPrompt.ts` | feed ranges as authoritative; adjust task wording |

## Tests
- **Deno**: plant-library contract tests — schema accepts/normalises the new
  ranges; `areaAnalysisPrompt` includes stored ranges + instructs "use these".
- **Vitest**: any client mapping of the new fields.
- e2e/test-plan: note the Area Coach now shows stable ranges.

## Risks
- Coverage — many library rows won't have ranges initially; the fallback to the
  model estimate avoids gaps. Surface "estimated vs from library" subtly.
- Units — store EC as calibrated µS/cm; the Coach already flags raw-ADC sensors.
- Keep the change additive (nullable columns) so nothing breaks pre-backfill.

## Docs to update
- `03-data-model-plants.md`, `25-plant-providers.md`, Plant Library admin refs,
  the Area Coach section of `03-location-manager.md`, `13-ai-gemini.md`.

## Update — Batch D (2026-06-18): population gap closed
Schema, the Coach reader, and the authoritative prompt all landed earlier, BUT step 2
(population) never wrote `plants.soil_*` — only `plant_library` is seeded, so users'
plants had NULL ranges and the Coach kept estimating (drift). Closed by
[batch-d-area-coach-stable-ranges.md](./batch-d-area-coach-stable-ranges.md):
`area-sensor-analysis` now fills missing ranges from the matching `plant_library` row
(`_shared/careRanges.ts`). Remaining (deferred) durability item: persist resolved ranges
back onto `plants.soil_*` via the AI plant care generator so non-library plants are
covered without the per-run library join.
