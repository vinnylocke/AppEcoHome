# Plan — Plant Library: deterministic names, reliable chain, full failure visibility

Three coordinated fixes for the seeder. All land in one deploy.

## App-reference consulted

- [07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md) — admin surface that renders runs + failures
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — seed-plant-library entry
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — daily 02:00 UTC cron payload

## Problem

1. **Skip rate is structural.** AI is biased toward famous plants. With <400 plants in DB, Gemini still proposes tomato/basil/rose because that's where its training distribution lives. The avoid list helps but doesn't fix it.
2. **Chains die mid-run.** Self-call from `scheduleContinuation` uses fire-and-forget `fetch(...).catch(...)` outside `EdgeRuntime.waitUntil`. When the chunk's `waitUntil` settles, the function tears down and the in-flight fetch may get canceled before the next invocation is hit. That's why runs cap around 50 (one chunk + maybe partial).
3. **Failure reasons hidden.** `count_failed` ticks up but only the FIRST batch error lands in `error_message`. Subsequent batch failures (each with its own Gemini cascade reason) are invisible — admin sees "50 failed" with no per-batch breakdown. Per-row `failed_inserts` is captured well; per-batch failures aren't.

## Fix 1 — Reliable chain (5-min)

In `scheduleContinuation`, wrap the fetch in `EdgeRuntime.waitUntil` so the runtime keeps the worker alive until the request lands:

```ts
function scheduleContinuation(runId: string, remaining: number): void {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seed-plant-library`;
  const fetchPromise = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: remaining, run_id: runId }),
  }).catch((err) => {
    logError(FN, "schedule_continuation_failed", { run_id: runId, remaining, error: (err as Error)?.message });
  });
  // @ts-expect-error EdgeRuntime is only available at runtime.
  EdgeRuntime.waitUntil(fetchPromise);
}
```

The receiving end returns 202 fast (<1s) so this adds negligible time to the chunk's completion. No new request awaited — we just guarantee the send.

## Fix 2 — Deterministic names from Wikipedia

Stop asking AI to invent plants. Pull names from Wikipedia category APIs (free, no key — already used in `verify-plant-library`), then use AI only to enrich each named plant with care data. Duplicates become impossible by construction.

**New file:** `supabase/functions/_shared/plantNameSources.ts`

```ts
const CATEGORIES = [
  "Garden_plants", "Vegetables", "Herbs", "Fruits", "Houseplants",
  "Ornamental_grasses", "Shrubs", "Trees", "Climbing_plants", "Succulents",
  "Bulbous_plants", "Annual_plants", "Perennial_plants",
  "Tomato_cultivars", "Apple_cultivars", "Rose_cultivars",
  "Lavender_cultivars", "Pepper_cultivars",
  "Edible_flowers", "Aquatic_plants",
];

/** Wikipedia category-members API. Free, no key. */
export async function fetchCategoryMembers(
  category: string,
  limit: number,
  cmcontinue?: string,
): Promise<{ titles: string[]; cmcontinue: string | null }>;

/**
 * Pick a random category, paginate to a random offset, return up to
 * `count` candidate plant names. Filters out obvious non-plants
 * (titles starting "List of", "Category:", "Template:", parenthetical
 * disambiguations, etc.).
 */
export async function fetchCandidatePlantNames(count: number): Promise<string[]>;
```

**New seed flow in `seed-plant-library/index.ts`:**

`runOneChunk` becomes:

1. Fetch `CHUNK_SIZE * 2` candidate names from Wikipedia (over-fetch for filtering headroom).
2. Filter against DB:
   ```ts
   select common_name, scientific_name_key
     from plant_library
     where common_name = ANY($1)
   ```
   Drop any candidate whose common_name already exists. Cheap single query.
3. Take up to `CHUNK_SIZE` survivors.
4. Split into BATCH_SIZE batches.
5. Per batch, call AI with the new prompt:
   > "Here are N specific plants by name. Return JSON care data for each, ONE entry per plant. Use the name verbatim as common_name. If a name is ambiguous (e.g. 'Pepper'), pick the most common garden interpretation. If a name is clearly NOT a real plant, omit it entirely — do not fabricate."
6. Insert into DB. ON CONFLICT backstops anything that still slips.

The avoid-list prompt section is **deleted**. The duplicate-check is done via DB query before AI sees anything. Prompt input tokens drop dramatically.

**What we lose:** AI was occasionally creative — it proposed cultivars + obscure varieties that aren't Wikipedia-noteworthy. Wikipedia is bounded by what has an article. Tradeoff: we get ~10-20k common garden plants reliably vs the open-ended (but duplicating) AI mode.

**What we keep:** All existing per-row insert error handling, the salvage parser for truncated JSON, the cost tracking, the chunk → continuation chain, the run row lifecycle.

## Fix 3 — Full failure visibility

When a whole batch fails (cascade exhausted, parse failure, etc.), we currently bump `count_failed` and set `error_message` only if it was empty. Subsequent batch failures vanish.

Repurpose `failed_inserts` jsonb to capture batch failures too — no new column, no schema change.

In `updateRunProgress`, when called with an `error` and no per-row `failedInserts`, synthesize a batch-failure row:

```ts
if (deltas.error && (!deltas.failedInserts || deltas.failedInserts.length === 0)) {
  deltas.failedInserts = [{
    common_name: `(batch of ${deltas.failed ?? 0} plants)`,
    scientific_name: null,
    error: deltas.error,
    at: new Date().toISOString(),
  }];
}
```

The existing admin "Failed seed inserts" panel renders these as-is. Rename the panel heading to **"Failed seed entries"** to reflect it shows both row failures and batch failures.

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/plantNameSources.ts` | New — Wikipedia category fetcher + candidate name picker |
| `supabase/functions/seed-plant-library/index.ts` | Refactor `runOneChunk` to fetch names first; new AI prompt for "fill in care data"; wrap `scheduleContinuation` fetch in `waitUntil`; synthesize batch-failure entries into `failed_inserts` |
| `src/components/admin/PlantLibraryAdmin.tsx` | Rename panel heading "Failed seed inserts" → "Failed seed entries" |

No migration. No new env vars. No cron change (existing `{ count: 1000 }` payload still works).

## App-reference updates required

- `docs/app-reference/07-management/10-plant-library-admin.md` — note the seed flow now uses Wikipedia for names + AI for care; "Failed seed entries" panel now covers batch failures too.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — update `seed-plant-library` entry: Wikipedia call added; AI prompt narrower.

## Sequencing

1. Write `plantNameSources.ts` with Wikipedia category fetcher + filter.
2. Refactor seed function: name fetch → DB filter → AI care-data call.
3. Wrap `scheduleContinuation` fetch in `waitUntil`.
4. Synthesize batch failures into `failed_inserts`.
5. Rename UI panel heading.
6. Update app-reference docs.
7. Typecheck both Deno + TS.
8. Deploy `--bump 1`.

## Risks / what to watch on first run

- **Wikipedia category contains non-plants.** Filter is heuristic. Some "Pepper (band)"-style false positives will reach AI. AI is instructed to omit non-plants; failures here count as `failed` with reason "AI omitted (not a plant)". Acceptable.
- **Same category picked repeatedly.** Random selection; over many chunks it averages out. Long-term we could track which categories have been exhausted.
- **Wikipedia API rate limits.** ~200 requests/min anonymously, well within our cadence (3 categories per chunk × 1 invocation per ~30s).
- **Title ≠ common name.** Wikipedia article "Lavandula angustifolia" is the scientific name, not the common name. AI prompt handles this: "Use the name verbatim as common_name unless it's a binomial — in which case provide the standard English common name."
