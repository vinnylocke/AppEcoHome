# Plan — Plant Library: iterate-until-enough + max-widen GBIF

## Goal

5000-plant batch submits should land closer to 3000+ survivors instead of stalling at ~200.

## Changes

### 1. Widen GBIF random offset to the API's documented max

Current: random offset in [0, 50000] — samples only 3% of GBIF's plant catalogue.

New: random offset in [0, 99999]. GBIF search API has a hard cap of 100k on offset (anything higher returns empty results), so this is the documented ceiling. The iteration loop below makes successive calls land on different offsets across the full range.

### 2. Iteration loop in `submit-plant-library-batch`

Replace single-pass fetch+filter with a loop:

```ts
async function gatherEnoughCandidates(
  db: any,
  count: number,
  maxIterations = 15,
): Promise<EnrichableCandidate[]> {
  // Fetch DB common-name Set ONCE upfront — passes through every iteration.
  const knownNames = await fetchKnownCommonNames(db);
  const seenThisSubmit = new Set<string>();
  const survivors: EnrichableCandidate[] = [];

  for (let i = 0; i < maxIterations && survivors.length < count; i++) {
    const raw = await fetchCandidatePlantNames(count);
    const fresh = raw.filter((c) => !seenThisSubmit.has(c.name.toLowerCase()));
    fresh.forEach((c) => seenThisSubmit.add(c.name.toLowerCase()));
    if (fresh.length === 0) {
      log(FN, "gather_no_fresh_candidates", { iteration: i });
      break;
    }

    const filtered = await filterCandidatesAgainstDbState(db, fresh, knownNames);
    survivors.push(...filtered);

    log(FN, "gather_iteration", {
      iteration: i,
      raw: raw.length,
      fresh: fresh.length,
      filtered_in: filtered.length,
      running_total: survivors.length,
      target: count,
    });
  }

  return survivors.slice(0, count);
}
```

### 3. Refactor filter to accept pre-fetched DB state

`filterCandidatesAgainstDb` currently re-fetches all common_names on every call. For 15 iterations × 10k rows = redundant network. Split into:
- `fetchKnownCommonNames(db)` — one upfront call, returns `Set<string>` of normalised existing names
- `filterCandidatesAgainstDbState(db, candidates, knownNames)` — accepts the Set, queries DB only for the per-iteration sci_keys

Per-iteration sci_key query is small (only fires against the freshly-resolved keys) so re-fetching that each iteration is fine.

## Files

| File | Change |
|------|--------|
| `supabase/functions/_shared/plantNameSources.ts` | GBIF random offset → [0, 99999] |
| `supabase/functions/submit-plant-library-batch/index.ts` | New `gatherEnoughCandidates` + refactored filter; replaces single-shot fetch in the handler |

## Out of scope (deferred per user direction)

- Perenual as a 5th source. Could add later if iteration alone isn't enough.

## Risks

- 15 iterations × 4 sources × ~5s each = up to ~75s of pre-AI work for a large submit. The batch is async (admin returns immediately with batch_id) so this is acceptable but worth knowing.
- iNat/Wikidata/GBIF rate limits are generous; even 15 rapid-fire calls per source per submit stays well under limits.

## Sequencing

1. Widen GBIF offset.
2. Split filter into `fetchKnownCommonNames` + `filterCandidatesAgainstDbState`.
3. Add `gatherEnoughCandidates`.
4. Typecheck Deno.
5. Deploy `--bump 1`.
