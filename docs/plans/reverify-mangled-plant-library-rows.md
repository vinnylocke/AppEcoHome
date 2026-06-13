# Plan — re-verify rows mangled by the pre-fix verifier

## Goal

The previous commit (`de43d76`) fixes the verifier so future runs preserve seasons and don't shrink multi-value arrays. This plan handles the rows the OLD verifier already mangled in production: reset their verification state so the cron picks them up again under the new contracts.

We do **not** have pre-mangle values stored anywhere — we can't restore the exact prior data. What we can do is requeue the rows; the next verify cycle re-fetches Wikipedia + GBIF and produces a correct amendment under the new prompt + schema + `pickAllowedUpdates` guard.

## App-reference files consulted

- [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — verifier row (just updated in `de43d76`).
- [13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Plant Library AI contracts (just added in `de43d76`).
- [11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — confirms `verify-plant-library` fires daily at 04:00 UTC with `BATCH_SIZE = 10` and a per-invocation cap.

## Detection criteria

Two classes, ordered by signal strength:

### A. Season-field mangle (unambiguous)

Any row where `flowering_season` or `harvest_season` contains a value NOT in `{spring, summer, autumn, winter}`. The seeder never wrote anything outside that vocabulary, so any non-enum value is from the verifier.

```sql
EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(coalesce(flowering_season, '[]'::jsonb)) AS s
  WHERE lower(s) NOT IN ('spring', 'summer', 'autumn', 'winter')
)
OR EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(coalesce(harvest_season, '[]'::jsonb)) AS s
  WHERE lower(s) NOT IN ('spring', 'summer', 'autumn', 'winter')
)
```

### B. Shrunk multi-value array fields (heuristic)

Rows where:
- `valid = false` (was amended at least once)
- AND `verified_at IS NOT NULL` (verification actually ran)
- AND at least TWO of `{propagation, attracts, pest_susceptibility, sunlight, soil}` have exactly one element

Single-element propagation on its own is plausible (a fern with `["spore"]`). The conjunction is much harder to explain — a plant where propagation AND attracts AND sunlight all simultaneously collapsed to one element is very likely a shrinking-amendment victim.

```sql
(
  CASE WHEN jsonb_array_length(coalesce(propagation,          '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
  CASE WHEN jsonb_array_length(coalesce(attracts,             '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
  CASE WHEN jsonb_array_length(coalesce(pest_susceptibility,  '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
  CASE WHEN jsonb_array_length(coalesce(sunlight,             '[]'::jsonb)) = 1 THEN 1 ELSE 0 END +
  CASE WHEN jsonb_array_length(coalesce(soil,                 '[]'::jsonb)) = 1 THEN 1 ELSE 0 END
) >= 2
AND valid = false
AND verified_at IS NOT NULL
```

## Reset action

For each matched row:

```sql
UPDATE public.plant_library SET
  verified_at           = NULL,
  valid                 = NULL,
  verification_attempts = 0,
  verification_error    = NULL,
  sources               = NULL,
  verified_by_run_id    = NULL
WHERE <criteria A OR B>;
```

That puts the row back in `backgroundVerify()`'s queue (the SELECT filters `verified_at IS NULL AND valid IS NULL`) without touching the actual data fields. The next cron tick re-fetches sources and re-amends under the new contracts.

Note we explicitly DO NOT clear the existing (mangled) `flowering_season` / `harvest_season` / `propagation` / `attracts` / etc. columns. Reason: the new `pickAllowedUpdates` non-shrink guard checks the current row to decide whether to reject a subset amendment. Leaving the existing (possibly mangled) values lets the next verifier compare against them. For seasons specifically, even leaving the month names in place is fine — the new verifier will either re-amend with proper seasons (replacing them), or default-pass (in which case the months stay, but at that point we have no better answer to substitute).

If after the re-verify the season fields STILL contain month names, that's a separate problem worth investigating — but I expect the new prompt + enum schema to suppress that.

## Delivery vehicle

A new dated migration: `supabase/migrations/20260613100000_reverify_mangled_plant_library.sql`.

Why a migration:
- Tracked in version control.
- Runs once per environment automatically — no manual psql incantation.
- Idempotent by construction: resetting an already-reset row is a no-op (criteria B requires `valid = false`; criteria A skips empty-array rows; both skip rows where `verified_at IS NULL`).

Why this is safe to migrate (not a one-shot script):
- The SELECT criteria are bounded — they target rows that exist *now* with mangle markers. On a fresh DB or future environment, those rows don't exist yet, so the migration touches zero rows.
- On the user's actual environment, the migration runs once and resets the mangled subset; future deploys of the same migration are no-ops because the rows have already been requeued and re-verified.

## Cost / volume estimate

- Plant library: ~40k rows total (per existing comments in `seed-plant-library`).
- Worst-case mangled fraction: hard to predict without running the detection query. Most likely 5–25% of `valid=false` rows — say a few thousand at most.
- Per-re-verify Gemini cost: ~$0.001 at Flash rates (5k prompt tokens, 1k output). 5000 rows = ~$5.
- Time to drain: verifier runs daily with default `count = 2000`. Worst-case backlog clears in 2-3 days.
- Cron is non-disruptive — runs at 04:00 UTC and shares the same fire-and-forget pattern as the seeder. Nothing else slows down.

If the detection query returns a worryingly large number, we have an escape valve: tighten criteria B (e.g. require 3 of 5 single-element fields instead of 2) before the migration ships.

## Verification (local)

1. Apply the migration locally: `supabase migration up`.
2. Confirm the reset count:
   ```sql
   SELECT count(*) FROM plant_library WHERE verified_at IS NULL AND valid IS NULL;
   ```
   Should equal the pre-migration count + however many got reset.
3. Manually invoke `verify-plant-library` with `{count: 50}` against the local DB. Confirm:
   - Season fields land on `{spring, summer, autumn, winter}` only.
   - Non-shrink fields are not strictly smaller than they were before re-verification.

## Files

| File | Why |
|---|---|
| `supabase/migrations/20260613100000_reverify_mangled_plant_library.sql` | NEW — runs the reset UPDATE |

App-reference files I'll touch:
- [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — append a one-line note under the verifier entry that the backfill migration ran on 2026-06-13.

## What this does NOT do

- Does NOT restore actual pre-mangle field values — we have no history to restore from. The next verifier re-amendment is our best available answer.
- Does NOT trigger an immediate verify call — it just empties the verification state so the next cron picks them up.
- Does NOT touch rows that look clean (verified, no obvious shrinkage).
- Does NOT modify `plant_library` schema.

## Risks I've thought about

- **False positives on criterion B**: a plant legitimately having two single-element multi-value arrays would get requeued. The cost is one extra Gemini call per false positive — small. The new verifier will re-amend it the same way (since the current values are sound), so the row ends up unchanged but verified again.
- **Cost surprise**: bounded by the count cap (default 2000/day per cron) and Flash pricing. We're talking single-digit dollars even in the worst case.
- **Mangled rows that don't match either criterion** (e.g. a season field that the verifier "matched" but the seeder originally had "summer" and the verifier still has "summer" — there's nothing to detect). Out of scope; we can't recover what we can't see.

---

**This is the plan. Reply "go ahead" to approve and I'll implement, or tell me which part to revise.**
