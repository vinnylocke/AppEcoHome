# Plant Library — split comma-joined arrays + seed missing plants from seasonal picks

## Two related problems

### Problem 1 — AI is writing `["autumn,summer"]` instead of `["autumn", "summer"]`

The DB column `plant_library.harvest_season` is `jsonb DEFAULT '[]'::jsonb` and the seed prompt schema explicitly says `ARRAY items STRING`. But the AI is still occasionally returning a **single-element array containing a comma-joined string** (`["autumn,summer"]`) which technically satisfies the schema. The insert path can't tell the difference and stores it as-is.

Downstream impact:
- Care guide displays "autumn,summer" as one chip instead of two.
- Task blueprints / schedules that look for individual season values never match — they look for `"autumn"` but find only the joined string.
- Same risk on every other string-array column the AI populates (`flowering_season`, `pruning_month`, `propagation`, `pest_susceptibility`, `soil`, `attracts`, `sunlight`, `scientific_name`).

### Problem 2 — Seasonal Picks suggest plants that may not exist in the library

The "What can I grow this week?" feature generates AI suggestions. Tapping a tile calls `ensureCataloguePlantFromSearchResult` which creates a row in the per-home **`plants`** table (the home catalogue) — but never touches the global **`plant_library`** (the admin knowledge base). The user wants picks that aren't already in the library to be **seeded into it** with full care guide data, so they become globally searchable and reusable.

---

## App-reference files consulted

- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — confirms the seed pipeline is `seed-plant-library` edge fn → Gemini → `plant_library` insert.
- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](docs/app-reference/02-dashboard/14-seasonal-picks.md) — confirms picks are cached in `home_seasonal_picks` and the generator lives in `_shared/seasonalPicksHandler.ts`.
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](docs/app-reference/99-cross-cutting/03-data-model-plants.md) — confirms `plants` (home-scoped) and `plant_library` (global) are separate tables with different purposes.
- [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — confirms `seed-plant-library` is the only writer to `plant_library`.

---

## Fix for Problem 1 — three layers of defence

### Layer A — Strengthen the seed prompt

In [`supabase/functions/_shared/plantSeedPrompt.ts`](supabase/functions/_shared/plantSeedPrompt.ts), add an explicit instruction near the top of the prompt:

> **CRITICAL — array fields must have separate elements.** Every field typed as an array (`scientific_name`, `sunlight`, `flowering_season`, `harvest_season`, `pruning_month`, `propagation`, `pest_susceptibility`, `soil`, `attracts`, …) MUST contain one value per element. NEVER comma-join multiple values into a single string. ✅ `["autumn", "summer"]` ✗ `["autumn,summer"]`.

This is the primary fix — preventing the bug from recurring on new seeds.

### Layer B — Defensive split in the insert path

In `seedRowToColumnShape()`, add a helper `splitJoinedStringArray(input)` that:

- Returns `[]` for null / non-array input (existing behaviour).
- For each element: if it's a string containing `,`, splits on `,`, trims each piece, drops empties.
- Otherwise passes the element through.

Apply to every `Array.isArray(p.X) ? p.X : []` line — replacing those expressions with `splitJoinedStringArray(p.X)`.

This catches the bug even if the prompt strengthening doesn't fully eliminate it (LLMs are LLMs).

### Layer C — Backfill existing rows

New migration `20260526180000_plant_library_split_joined_arrays.sql` that runs a PL/pgSQL block to scan `plant_library` and, for every string-array column listed above, splits any element containing a comma into separate array elements.

The transform is idempotent — running it twice produces the same result. So if the prompt + defensive split layers also catch new bad data, this migration just heals the existing rows once.

---

## Fix for Problem 2 — pipe picks → plant_library seed

### Where the hook goes

In [`supabase/functions/_shared/seasonalPicksHandler.ts`](supabase/functions/_shared/seasonalPicksHandler.ts), after the cache upsert at line ~243, add a non-blocking call that:

1. For each pick, build `<Common Name> [<Scientific name>]` — the exact `name [sci]` format the existing seeder expects (so the unique key is preserved + no duplicates).
2. Pre-check `plant_library` for any row already matching by `sci_key`. Skip those.
3. For the remaining names, POST to `seed-plant-library` with `{ count: <N>, plantNames: <picks> }`.

But `seed-plant-library` currently sources names from Wikipedia categories — it doesn't accept caller-supplied names. We need a small change there too:

### Extend `seed-plant-library` to accept explicit plant names

Add an optional `plantNames: string[]` to the request body. When present, **skip the Wikipedia name discovery step entirely** and go straight to enrichment with those names. Everything downstream (Gemini call, insert, image fetch, sci_key dedup) stays unchanged.

When absent (current cron path), behaviour is unchanged.

### Make the picks → seed call non-blocking

Wrap the seed invocation in `EdgeRuntime.waitUntil` so the seasonal-picks response isn't held up. The pick UI doesn't depend on the library row existing — it's a background backfill.

### Cron also benefits

The same pipeline will also work on the weekly `refresh-seasonal-picks` cron — picks generated for any home that aren't in the library get auto-seeded in the background.

---

## Files

| File | Change |
|---|---|
| `supabase/functions/_shared/plantSeedPrompt.ts` | Strengthen prompt about array elements; add `splitJoinedStringArray` helper; apply to all string-array fields in `seedRowToColumnShape`. |
| `supabase/migrations/20260526180000_plant_library_split_joined_arrays.sql` | NEW — backfill: split any comma-joined elements across affected string-array columns. |
| `supabase/functions/seed-plant-library/index.ts` | Accept optional `plantNames: string[]` in request body; bypass Wikipedia discovery when supplied. |
| `supabase/functions/_shared/seasonalPicksHandler.ts` | After cache upsert, fire `seed-plant-library` for any picks not already in `plant_library` (non-blocking). |
| `tests/unit/lib/plantSeedPrompt.test.ts` | NEW — unit test for `splitJoinedStringArray` helper. |

---

## Risks & edge cases

- **Comma legitimately in a string value**: rare for season/sunlight/propagation tokens (all single words). Soil ph descriptors etc. don't have commas either. Backfill is safe for the listed columns; we won't touch description/name/notes fields.
- **Seed-from-picks cost**: each picks generation could trigger up to 6 new library seeds × Gemini enrichment + Wikipedia image. Budget-wise: a 6-plant enrichment is ~$0.002 with the cascade. Acceptable.
- **Duplicate prevention**: pre-checking `sci_key` + the existing `ON CONFLICT DO NOTHING` constraint guarantees no doubles even if two homes generate overlapping picks simultaneously.
- **Picks may have inaccurate scientific names**: if the AI gets the binomial slightly wrong (e.g. spelling variant), it could create a near-duplicate. Mitigation: the existing seed pipeline already has a `sci_key` normalisation step that lowercases + strips whitespace, which handles common cases. Out of scope for this PR to make name matching fuzzy.
- **Backfill is read-then-write on potentially 40k rows**: I'll filter to rows where at least one of the target columns has a `,` in any element, so most rows are no-ops.

---

## Steps

1. Strengthen seed prompt.
2. Add `splitJoinedStringArray` helper + apply to insert path.
3. Add backfill migration + apply locally.
4. Extend `seed-plant-library` to accept `plantNames`.
5. Wire the seasonal-picks handler to fire library seeds in the background.
6. Add unit test for the helper.
7. Typecheck. Run unit tests.
8. Push migration to remote (with explicit confirmation).
9. Deploy via `npm run deploy --bump 1`.

---

## User-confirmed refinement (post-plan)

**Library-first lookup wins** — when a pick has a matching `plant_library` row, the tap/care-guide flow MUST skip the Gemini care-guide generation entirely and use the existing library data. This is a meaningful cost saving (~$0.002 per Gemini call avoided × every pick tap).

### Additional change scope

| File | Change |
|---|---|
| `supabase/functions/_shared/seasonalPicks.ts` | Add `plant_library_id?: number \| null` to `SeasonalPick` type. |
| `supabase/functions/_shared/seasonalPicksHandler.ts` | Before caching the picks, look up each one in `plant_library` and attach `plant_library_id` when found; fire background seed only for the misses. |
| `src/services/seasonalPicksService.ts` | Mirror the new field on the client-side `SeasonalPick` type. |
| `src/components/seasonal/SeasonalPickTile.tsx` | When the pick has `plant_library_id`, build the synthesised search result with `catalogue_hit: { plant_id: …, source: "library" }` so the preview path uses the existing library row instead of generating fresh data. |
| `src/lib/plantCatalogue.ts` | In `ensureCataloguePlantFromSearchResult`, when a result carries a `plant_library_id`, clone the library row's care guide / image into the home `plants` table instead of invoking Gemini. New helper `ensureCataloguePlantFromLibrary(libraryId, homeId?)`. |

Decision: **ship both problems + library-first hook together** (per user choice + cost-cheap per pick, no gate needed).
