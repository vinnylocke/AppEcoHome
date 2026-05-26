# Plan — Plant Library: multi-source candidates + stop double-processing

Two coordinated changes:

## Part A — Stop batch double-processing (urgent bug)

**Symptom:** processed batches creating two `plant_library_runs` rows with the same plants + sum of cost. User reported "doubles in the logs … putting the cost total off."

**Cause:** After `pollOne` flips a batch row to `status='succeeded'`, the next 5-min cron tick OR a user clicking Check/Reprocess can both enter `processSucceededBatch` before the first run reaches its final `status='processed'` update (which only happens at the END of processing). Two concurrent processing runs, two run rows, double the recorded cost.

**Fix:** Atomic claim via `processed_at` at the START of `processSucceededBatch`:

```ts
const { data: claimed } = await db
  .from("plant_library_batches")
  .update({ processed_at: new Date().toISOString() })
  .eq("id", batch.id)
  .is("processed_at", null)
  .select("id");
if (!claimed || claimed.length === 0) {
  log(FN, "process_already_claimed_skip", { batch_id: batch.id });
  return;
}
```

`reprocessPlantLibraryBatch` already clears `processed_at` to null first, so it claims cleanly on the second pass.

## Part B — Multi-source candidate fetcher

**Symptom:** 5000-plant batch only landed 800. Wikipedia category pool (~19k titles total, 6 categories × 500 sampled per call) saturates against existing DB rows; supply is the bottleneck, not the AI work.

**Fix:** Add two new sources alongside Wikipedia, merge pools in `fetchCandidatePlantNames`. Both new sources return scientific names DIRECTLY in their response, meaning we skip the per-candidate Wikipedia summary lookup for them — major speed win in the skip-reduction step.

### New source 1: iNaturalist taxa

`GET https://api.inaturalist.org/v1/taxa?taxon_id=47126&rank=species&per_page=200&page=<random 1-50>&order_by=observations_count&order=desc`

- `taxon_id=47126` = Plantae kingdom
- Sort by observation count → biases toward popular / well-known plants
- Random page 1-50 → variety from top ~10k most-observed plants
- Returns: `name` (scientific), `preferred_common_name`, `observations_count`
- Free, no key, generous rate limits

### New source 2: Wikidata SPARQL

`POST https://query.wikidata.org/sparql` with Accept: application/json

```sparql
SELECT DISTINCT ?item ?common ?sci WHERE {
  ?item wdt:P225 ?sci .
  ?item wdt:P171* wd:Q756 .
  ?item rdfs:label ?common . FILTER(LANG(?common) = "en")
}
LIMIT 500 OFFSET <random 0-50000>
```

- `wdt:P225` = taxon name (scientific)
- `wdt:P171*` = parent taxon transitive, `Q756` = Plantae kingdom
- Random offset → variety across the catalogue
- Returns: structured `{ item, common, sci }` per row
- Free, no key (User-Agent header required by Wikimedia policy — we send a descriptive UA)

### Combined fetcher

Rework `fetchCandidatePlantNames(count)` to:

1. In parallel, fetch from all three sources at proportional volumes (e.g. 40% iNat, 30% Wikipedia, 30% Wikidata).
2. Dedupe by lowercased name across the merged pool.
3. Each entry carries `{ name, sciName?: string }` — `sciName` set from iNat / Wikidata, null from Wikipedia.
4. Shuffle and return up to `count`.

`filterCandidatesAgainstDb` updated to:

- If `sciName` present, use it directly (no Wikipedia summary fetch needed).
- If `sciName` null (Wikipedia source), fall back to current Wikipedia summary extraction.

That removes ~70% of the Wikipedia summary HTTP calls from skip-reduction.

## Files

| File | Change |
|------|--------|
| `supabase/functions/poll-plant-library-batches/index.ts` | Atomic claim at top of `processSucceededBatch` |
| `supabase/functions/_shared/plantNameSources.ts` | New `fetchInaturalistTaxa()`, `fetchWikidataPlants()`, rework `fetchCandidatePlantNames()` to merge sources; change return shape from `string[]` to `Array<{ name; sciName?: string }>` |
| `supabase/functions/seed-plant-library/index.ts` | `filterCandidatesAgainstDb` uses pre-resolved sciName when present, falls back to Wikipedia summary for legacy candidates |
| `supabase/functions/submit-plant-library-batch/index.ts` | Same filter update |

## Skipped per user request

One-off cleanup script for existing doubled run rows.

## Sequencing

1. Atomic claim (Part A) — small, safe, urgent.
2. Multi-source fetcher (Part B) — bigger surface area, but additive.
3. Typecheck Deno + TS.
4. Deploy `--bump 1`.
