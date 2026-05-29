# Plan — Intelligently de-duplicate the `plant_library` table

## Goal

Remove duplicate `plant_library` rows where the **common name AND scientific name are the same case-insensitively** (the user has seen pairs that differ only in letter case). Keep the most complete row of each duplicate set; delete the rest.

## What I've verified (read-only)

- **Schema** (`supabase/migrations/20260624000900_plant_library.sql`): `id bigserial PK`; `common_name text`; `scientific_name jsonb` (array); a **generated `scientific_name_key`** = `lower(trim(regexp_replace(COALESCE(scientific_name->>0, common_name), '\s+',' ')))` with a **UNIQUE index** `plant_library_sci_key_idx`.
- **No foreign keys reference `plant_library.id`.** Other tables (`plants` catalogue) *copy* library data at clone time; `forked_from_plant_id` references `plants(id)`, not `plant_library`. So deleting a duplicate library row breaks **no DB constraint**. The only "soft" reference is a cached search selection carrying a `plant_library_id`; if that points at a deleted row, `ensureCataloguePlantFromLibrary` already falls back to Gemini gracefully (no breakage).
- **Why dupes exist despite the unique index:** the index only keys on the *first* scientific name (or common name). Pairs likely slipped in because their first-scientific-name normalises differently (e.g. extra author text, punctuation, or the array order/contents differ) while the user still reads them as "the same plant." The dry-run below will show the real shape before we delete anything.

## Approach — a one-off script, dry-run first

A maintenance script `scripts/dedupe-plant-library.mjs`, **dry-run by default**, `--apply` to actually delete. Loads `SUPABASE_PROD_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env` exactly like `scripts/deploy.mjs`. (A migration is a poor fit: local `plant_library` ≠ prod, so it can't preview, and the user wants to see what's removed first.)

### Dedup key

`lower(trim(common_name))` + `||` + the scientific-name array normalised: each element `lower(trim(...))`, **sorted**, joined — so `["Rosa rubiginosa"]` and `["rosa rubiginosa"]` collide, and `["A","B"]` == `["B","A"]`. Both common name and scientific name must match (stricter = safer; won't merge a shared scientific name under different common names).

### Keeper selection ("intelligently")

Within each duplicate group, keep the row with the highest **completeness score**, tie-broken by **lowest `id`** (oldest):
- `valid === true` (verified) → strong bonus
- has `image_url`/`thumbnail_url` → bonus
- +1 per filled meaningful field (`description`, `family`, `plant_type`, `cycle`, `watering`, `watering_min/max_days`, non-empty `sunlight`, `care_level`, `pruning_month`, `harvest_season`, `propagation`, etc.)

### Dry-run output (what you'll see before any deletion)

- Total rows scanned, number of duplicate groups, total rows that would be deleted.
- For a sample of groups: the **kept** row (id + common + scientific) and each **deleted** row (id + common + scientific) so the case/spelling differences are visible.

### Apply mode (`--apply`)

- Deletes the non-keeper ids in batches via `supabase.from('plant_library').delete().in('id', batch)` (service role). Deletes are independent rows (no FK cascade concerns), so a partial failure is safely re-runnable.
- Re-counts and reports how many were removed.

## Safety / process

1. Write the script. **Run dry-run only**; paste the summary + sample groups for your review.
2. **Wait for your explicit go-ahead** before running `--apply` (destructive on shared prod data).
3. Apply → report results.

## Out of scope (flagged)

- **Preventing future dupes** by adding a stricter unique index on `(lower(common_name), normalised scientific_name)` — that's a schema migration; can follow once we see whether the current `scientific_name_key` index is actually enforcing on prod.
- **Merging** partial data between near-duplicates (we keep the most complete row wholesale, not field-by-field merge).

## Tests / docs

- The dedup logic (key + keeper score) is pure — extract into a small testable function in the script or `src/lib`? It's a one-off node script; I'll add a tiny self-check or keep it inline. No app behaviour changes, so no app-reference change beyond a note in `03-data-model-plants.md` that dupes were cleaned + how the key works.

## No deploy

This is a direct data operation against prod via the service key — **not** a code deploy. No version bump, no `npm run deploy`. (I'll still commit the script to the repo for the record.)
