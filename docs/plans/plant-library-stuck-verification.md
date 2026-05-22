# Plan — fix rows that won't verify

## Bug

A basil row in `plant_library` has `valid = NULL` after multiple verify runs. The verifier picks it up, attempts to verify, and silently fails to update — so the next run picks it up again. Infinite loop. Three failure paths cause this today:

1. **Update silently fails on type mismatch.** When the AI returns `verdict='amended'` with `updates` containing the wrong shape for a field (e.g. `watering_min_days: "7"` as a string instead of a number), postgres rejects the update. Our code doesn't check the error and just continues.
2. **Gemini call throws.** Network blip, quota exhausted, all four model fallbacks fail. The exception propagates up to the batch-level `.catch(() => "failed")`, the row is never touched, `verified_at` stays null.
3. **JSON.parse fails.** Gemini returned text we can't parse. Same outcome.

## Fix

### 1. Add two columns

`verification_attempts INT NOT NULL DEFAULT 0` — how many times the verifier has picked this row.

`verification_error TEXT NULL` — last error message if verification failed. Cleared on success.

### 2. Verifier guarantees forward progress on every row

Wrap the per-row work in a single try/catch at the top of `verifyOneRow`. On ANY failure:

- Increment `verification_attempts`.
- Store the error message in `verification_error`.
- **Do not mark `verified_at`** — the row is allowed to retry.
- Return `"failed"`.

After `MAX_ATTEMPTS` (3), the next failure escalates to a **default-pass**: set `valid = true`, `verified_at = now()`, leave `verification_error` populated. The row stops churning and is treated as good enough — if the failure is on our side (token limit, malformed schema response) the data is probably fine anyway.

### 3. Check every update's error result

Every `await db.from(...).update(...).eq(...)` call captures `{ error }`. On error, throw to the top-level catch so the row enters the failure path above. Stop pretending updates always succeed.

### 4. Coerce AI-returned numeric fields

`watering_min_days`, `watering_max_days`, `days_to_harvest_min`, `days_to_harvest_max`, `soil_ph_min`, `soil_ph_max` — coerce to number via `Number(value)` and drop if NaN. Stops the most common cause of type-mismatch updates.

### 5. Surface the error in the admin UI

Add a "Failed verifications" panel to `/admin/plant-library` that lists rows with `verification_attempts > 0` along with their last error. Lets us see what's going wrong without diving into the DB.

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_plant_library_verification_diagnostics.sql` | Add `verification_attempts` + `verification_error` columns |
| `supabase/functions/verify-plant-library/index.ts` | Top-level try/catch, check update errors, coerce numerics, default-pass after MAX_ATTEMPTS |
| `src/services/plantLibraryAdminService.ts` | New `fetchFailedVerifications()` |
| `src/components/admin/PlantLibraryAdmin.tsx` | New "Stuck rows" section listing recent failures |

## Sequencing

1. Migration locally.
2. Verifier hardening.
3. Admin UI panel.
4. Typecheck + deploy.

## Notes on the existing basil row

The deploy alone won't fix the existing stuck basil — its `verification_attempts` will start at 0. But the next verify run will pick it up, fail in a recorded way (`verification_error` populated), retry twice more, then default-pass on the 4th run. So within a day it'll have `valid = true` and we'll see what was wrong.

If we want to be more aggressive we can `UPDATE plant_library SET verification_attempts = 3 WHERE id = ?` for known-stuck rows so the next run default-passes immediately. Skip for now — the natural progression is fine.
