# Plan — Plant Library: time-budget iterations + cursor-based pagination

Two coordinated phases. Ship together; the cursor work only pays off when the iteration loop has time to walk multiple pages.

## App-reference consulted

- [07-management/10-plant-library-admin.md](../app-reference/07-management/10-plant-library-admin.md)
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md)

## Phase 1 — iteration improvements

### Time budget instead of hard count
- `gatherEnoughCandidates` switches from `maxIterations: 5` to a **time budget** (~120s) with a safety max of 10 iterations.
- Loop checks elapsed time before each iteration; exits when budget consumed OR `survivors.length >= count` OR no fresh data.

### Per-source fresh-rate skipping
- Track per-source counts within a submit: `freshThisSubmit[source]` and `fetchedThisSubmit[source]`.
- After each iteration, if any source's fresh rate is <10% (returns mostly already-seen names), add it to a per-submit skip set.
- Subsequent iterations don't call skipped sources — frees their 8s timeout budget for productive sources.

## Phase 2 — cursor-based pagination

### New table

```sql
CREATE TABLE public.plant_library_source_cursors (
  source       text PRIMARY KEY,
  cursor       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-source state
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'exhausted')),
  total_pages  integer,                              -- when known (from API response)
  exhausted_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed initial rows
INSERT INTO plant_library_source_cursors (source, cursor) VALUES
  ('perenual',  '{"page": 1}'),
  ('verdantly', '{"letter": "a", "page": 1}'),
  ('wikidata',  '{"offset": 0}'),
  ('gbif',      '{"offset": 0}')
ON CONFLICT (source) DO NOTHING;
```

Per-source cursor shape:
- **Perenual:** `{ "page": N }` — sequential 1..total_pages
- **Verdantly:** `{ "letter": "a", "page": N }` — walks a→z, each letter's pages
- **Wikidata:** `{ "offset": N }` — sequential 0..50000 step 500
- **GBIF:** `{ "offset": N }` — sequential 0..99999 step 100

Admin-only RLS.

### Fetcher refactor

Each cursor-driven source becomes:

```ts
async function fetchPerenualPlants(db: any): Promise<CandidatePlant[]> {
  const cursor = await readCursor(db, "perenual");
  if (cursor.status === "exhausted") return [];
  const page = (cursor.cursor.page as number) ?? 1;
  const results = await fetchPerenualPage(page);
  // Advance cursor by 1 page (or mark exhausted on empty response)
  if (results.length === 0) {
    await markCursorExhausted(db, "perenual");
  } else {
    await advanceCursor(db, "perenual", { page: page + 1 });
  }
  return results;
}
```

Verdantly: when page yields <expected, advance to next letter. When letter = 'z' and page exhausted, mark source exhausted.

Wikidata + GBIF: advance offset by LIMIT each call. Mark exhausted when API returns 0 results.

**Wikipedia + iNat stay random** — Wikipedia categories overlap too much for sequential, iNat's popularity sort is useful for variety.

### Multi-page fetch per iteration for high-value sources

Bump Perenual + Verdantly to fetch 3 pages per iteration call (instead of 1). They're our best supply now — give them proportional bandwidth.

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260624002400_plant_library_source_cursors.sql` | New cursor table + initial rows |
| `supabase/functions/_shared/plantNameSources.ts` | Refactor 4 cursor-driven fetchers; bump Perenual/Verdantly to multi-page; add cursor read/advance helpers |
| `supabase/functions/submit-plant-library-batch/index.ts` | Time-budget iteration loop + per-source fresh-rate skip |
| `supabase/functions/seed-plant-library/index.ts` | Same gather-loop change (sync flow benefits from cursors too) |

## App-reference updates

- `07-management/10-plant-library-admin.md` — note cursor-based sources (Perenual / Verdantly / Wikidata / GBIF) walk sequentially; random sources (Wikipedia / iNat) still random
- `99-cross-cutting/10-edge-functions-catalogue.md` — update seed-plant-library + submit-plant-library-batch entries

## Risks

- Concurrent submits race on cursor reads. Worst case: both fetch the same page, DB unique index dedupes. Acceptable.
- Sources we mark exhausted stay exhausted across deploys. If we want to re-run (e.g. catalogue grew), admin can `UPDATE` the row directly. Could add a UI button later.
- Verdantly's letter walk assumes ~10 pages per letter; over-iteration on a letter wastes a few API calls before advancing.

## Sequencing

1. Migration (cursor table + seed rows).
2. Apply locally.
3. Cursor read/advance helpers in plantNameSources.ts.
4. Refactor 4 cursor-driven fetchers.
5. Time-budget gather loop + per-source fresh-rate skip (submit-batch + sync seed).
6. App-reference docs.
7. Typecheck.
8. Deploy.
