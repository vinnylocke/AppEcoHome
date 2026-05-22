# Plan — fix stale "running" rows + tune Gemini cascade

Two related issues the user hit on a large seed batch.

## Issue 1 — runs stuck in `status='running'`

When the edge function instance dies (Supabase background-task timeout, OOM, deploy mid-flight), neither the success-path nor the catch-block update on `plant_library_runs` runs. The row stays at `status='running'` forever and the admin UI keeps polling.

Today's resolution paths if the function exits cleanly:
- `backgroundSeed` / `backgroundVerify` finish normally → `status='succeeded'`
- They throw → `catch` block → `status='failed' + error_message`

What we're missing: any path that handles "the function vanished without running either of those". Need a way to detect that and mark the run failed automatically.

## Issue 2 — Gemini Flash overload causing batch failures

The seeder already uses `callGeminiCascade` which iterates four models with per-model retries. But the default `maxRetriesPerModel: 2` is thin for a service-wide overload, and a single batch failure marks `count_failed += BATCH_SIZE` even though the remaining batches in the run still process. The user wants confidence we're cascading AND that failures get recorded per-batch (which they already do — let me verify and surface it better).

## Fix

### A. Heartbeat + sweep

1. **Add `last_heartbeat_at timestamptz` to `plant_library_runs`.**
2. **Seed + verify functions update the heartbeat after every batch** via the existing `updateRunProgress()` helper. Set it once at the start of `backgroundSeed`/`backgroundVerify` too so newly-started runs have a non-null timestamp immediately.
3. **Admin RLS gets an UPDATE policy** on `plant_library_runs` so the admin page can mark stale runs failed directly. The existing read policy already restricts to `is_admin`; the new update policy mirrors it.
4. **Admin page sweeps on every refresh**: if any row has `status='running'` AND `COALESCE(last_heartbeat_at, started_at) < now() - 10 minutes`, flip to `status='failed'`, `error_message='abandoned — no heartbeat for 10+ minutes (function likely timed out or was killed)'`, `finished_at=now()`.

A 10-minute threshold is generous — the worst-case real seed batch takes ~3s, so 10 minutes of silence means the function is genuinely dead. We don't want to false-positive a slow batch.

### B. Cascade tuning + per-batch errors

1. **Bump `maxRetriesPerModel` from 2 to 3** in both `seed-plant-library` and `verify-plant-library` calls. 4 models × 3 retries = 12 attempts before throwing. Helps with transient overload.
2. **Add `error_message` accumulation** on the run row when a batch fails. Currently `backgroundSeed`'s catch block logs and counts `failed += batch_size` but doesn't record WHY. Append the error to a new `error_message` field on the run row (we already have one for fatal failures — reuse it, capped at 2KB, only set if not already populated by a fatal failure).

### Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_plant_library_heartbeat.sql` | Add `last_heartbeat_at` + admin UPDATE policy |
| `supabase/functions/seed-plant-library/index.ts` | Update heartbeat per batch + bump cascade retries + capture batch errors |
| `supabase/functions/verify-plant-library/index.ts` | Same |
| `src/services/plantLibraryAdminService.ts` | New `sweepStalePlantLibraryRuns()` helper |
| `src/components/admin/PlantLibraryAdmin.tsx` | Call sweep on every refresh; the existing polling drives this naturally |

### Out of scope

- A separate janitor cron. The admin-page sweep is enough — it fires every time anyone with admin opens the page, and the next seed/verify run picks up the marked-failed rows naturally. If we ever want background cleanup independent of admin attention, add a cron later.
- Resuming a killed run from where it left off. Killed runs are marked failed; if the admin wants more plants they trigger a new run. Resumption logic is real work; skip until needed.
- Splitting >2000-plant runs across multiple invocations. The user can trigger smaller runs in succession if needed; the daily cron stays at 1000 which is comfortably inside the background-task budget.

## Sequencing

1. Migration locally.
2. Edit both edge functions + the admin service + page.
3. Typecheck + deploy.
4. The migration's UPDATE policy clears the user's current stuck run on the next page refresh.
