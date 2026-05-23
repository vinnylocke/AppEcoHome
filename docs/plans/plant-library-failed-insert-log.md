# Plan — surface failed seed inserts on the admin page

## What's missing today

Seed failures are counted (`stats.failed += 1`) and logged to Sentry via `logError`, but they're not stored anywhere the admin UI can read. So the admin sees "5 failed" on a run but can't tell WHICH plants and WHY. The verification flow has the "Stuck verifications" panel for the same problem — we want the equivalent for seed.

## Fix

### 1. Store failures on the run row

Add `failed_inserts jsonb DEFAULT '[]'::jsonb` to `plant_library_runs`. Shape:

```jsonc
[
  {
    "common_name": "Tomato 'Cherokee Purple'",
    "scientific_name": "Solanum lycopersicum 'Cherokee Purple'",
    "error": "invalid input syntax for type numeric: \"7-10\"",
    "at": "2026-05-23T08:50:01Z"
  },
  ...
]
```

Capped at 200 entries per run (defensive — large runs with many failures could otherwise balloon).

### 2. Seeder accumulates per batch

`runSeedBatch` already iterates plants one-by-one and catches the postgres error. Currently it just increments `stats.failed`. Change: also push `{ common_name, scientific_name, error, at }` onto a local `failedInserts: FailedInsert[]` and return it on `stats`. `updateRunProgress` accepts a `failedInserts` delta and concat-merges onto the run row (capped at 200 entries).

### 3. New service helper

`fetchFailedSeedInserts(limit = 50)` queries runs where `jsonb_array_length(failed_inserts) > 0`, flattens the JSON, returns `[{ run_id, common_name, scientific_name, error, at }]` sorted by `at DESC`. Cap at `limit` for the UI.

### 4. Admin UI panel

New "Failed seed inserts" section on the Overview tab, mirroring the existing "Stuck verifications" panel layout — table with columns: Plant, Scientific Name, Error, When, Run.

Only renders when there's at least one failure (same conditional as the stuck panel today).

## Files

| File | Change |
|------|---------|
| `supabase/migrations/<ts>_plant_library_runs_failed_inserts.sql` | Add `failed_inserts jsonb` column |
| `supabase/functions/seed-plant-library/index.ts` | Collect failures in runSeedBatch; pass through updateRunProgress |
| `src/services/plantLibraryAdminService.ts` | New `FailedSeedInsert` type + `fetchFailedSeedInserts()` helper |
| `src/components/admin/PlantLibraryAdmin.tsx` | New panel below "Stuck verifications" |

## Sequencing

Migration → seeder → service → UI → typecheck → deploy.
