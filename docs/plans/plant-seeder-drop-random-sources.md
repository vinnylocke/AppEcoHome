# Plant Seeder — drop random sources + auto-mute in cron

## Goal

Reduce the climbing skip rate on the Plant Library seeder by removing the two random-sampling sources (Wikipedia categories + iNaturalist) and keeping only the four cursor-driven sources that make forward progress on every call (Wikidata, GBIF, Perenual, Verdantly).

Also: wire the existing per-source auto-mute (currently only in `submit-plant-library-batch`) into the cron `seed-plant-library` path so any source that starts returning duplicates mid-run gets muted for the rest of the run.

## Why random sources are the skip driver

| Source | Pagination | Behaviour on repeated calls |
|---|---|---|
| Wikipedia categories | Random category + random page | Re-samples popular plants every call |
| iNaturalist | Random page in `[1, 500]` | Re-samples popular plants every call |
| Wikidata SPARQL | `LIMIT/OFFSET` cursor | Forward progress, no repeats |
| GBIF | `offset` cursor (cap 100k) | Forward progress, no repeats |
| Perenual | `page` cursor | Forward progress, no repeats |
| Verdantly | `(letter, page)` cursor | Forward progress, no repeats |

As the DB fills with popular plants, the two random sources increasingly hit duplicates already in the DB, which the seeder skips. Removing them removes the duplicate problem at the root without losing breadth — Wikidata and GBIF cover the wild/native/regional taxa Perenual+Verdantly miss.

## App-reference files consulted

- [`docs/app-reference/07-management/10-plant-library-admin.md`](docs/app-reference/07-management/10-plant-library-admin.md) — confirms the seed pipeline is `seed-plant-library` edge fn calling `fetchCandidatePlantNames`.
- [`docs/app-reference/99-cross-cutting/11-cron-jobs.md`](docs/app-reference/99-cross-cutting/11-cron-jobs.md) — confirms `seed-plant-library` is the daily 02:00 UTC cron.

---

## Changes

### 1. `supabase/functions/_shared/plantNameSources.ts`

- In `fetchCandidatePlantNames`, drop the Wikipedia + iNat parallel calls entirely (don't kick them off at all, not even with timeouts).
- Keep `fetchCategoryMembers` + `fetchInaturalistTaxa` exported as utilities (we may re-enable them or use them for the `caller_supplied` path later — no harm in keeping the code).
- Narrow `SourceName` from 6 to 4 entries: `"wikidata" | "gbif" | "perenual" | "verdantly"`. The `CandidatePlant.source` union retains the old members so existing data in `failed_inserts` etc. still parses cleanly.

### 2. `supabase/functions/seed-plant-library/index.ts`

- Mirror the auto-mute pattern from `submit-plant-library-batch`:
  - Track `fetchedBySource[s]` and `freshBySource[s]` across iterations within a chunk.
  - After each iteration, mute any source whose `fresh / fetched < FRESH_RATE_THRESHOLD` (same threshold value used in the batch path — exported from a shared constant so both stay in lockstep).
  - Pass the resulting `skipSources` set into the next `fetchCandidatePlantNames` call.
- This is bonus protection for when Perenual/Verdantly eventually saturate too (years from now). Doesn't affect today's behaviour because none of the cursor sources are saturated yet.

### 3. Extract `FRESH_RATE_THRESHOLD` to a shared constant

Currently a magic number in `submit-plant-library-batch`. Move it to `plantNameSources.ts` so both the batch and cron seed paths import the same value. No behaviour change in the batch path.

---

## Files

| File | Change |
|---|---|
| `supabase/functions/_shared/plantNameSources.ts` | Narrow `SourceName`; drop Wikipedia + iNat from `fetchCandidatePlantNames`; export `FRESH_RATE_THRESHOLD`. |
| `supabase/functions/seed-plant-library/index.ts` | Wire auto-mute loop in `runOneChunk`. |
| `supabase/functions/submit-plant-library-batch/index.ts` | Replace inline `FRESH_RATE_THRESHOLD` with import from `plantNameSources`. |

---

## Risks & edge cases

- **Wikipedia + iNat had unique cultivar coverage** — both include named cultivars (e.g. specific tomato varieties from Wikipedia's `Tomato_cultivars` category) that aren't always in Wikidata/GBIF. Tradeoff accepted: Perenual + Verdantly cover thousands of cultivars and we still have those categories' content in the existing seeded rows.
- **No data migration needed** — existing seeded rows stay as they are. Only future cron runs and Batch API runs are affected.
- **Type union narrowing** — `SourceName` losing two members might break callers that pattern-match on it. The two callers (`submit-plant-library-batch`, `seed-plant-library`) need their source loops updated to the new 4-element union.

---

## Steps

1. Extract `FRESH_RATE_THRESHOLD` to shared.
2. Narrow `SourceName`, drop Wikipedia + iNat from `fetchCandidatePlantNames`.
3. Update the source loop in `submit-plant-library-batch` to the new union.
4. Wire auto-mute into the cron `seed-plant-library` chunk runner.
5. Typecheck, run unit tests.
6. Deploy via `npm run deploy --bump 1`. No DB migration.
