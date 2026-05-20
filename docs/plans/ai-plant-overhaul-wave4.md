# Plan — AI Plant Overhaul Wave 4: Stale-check cron + revision history

## Goal

Ship the server-side freshness loop for the AI plant catalogue. A daily cron walks every global AI plant whose care guide hasn't been verified in the last 90 days, re-asks Gemini for a fresh care guide, diffs it against the stored copy, and — only when something genuinely changed — bumps the row's `freshness_version`, writes an audit row to `plant_care_revisions`, and stamps the changed-field list on `plants.updated_care_fields`. Rows that haven't drifted just get their `last_freshness_check_at` reset so they're not re-checked for another 90 days.

This wave delivers **only the data flow**. No UI surfaces it yet — that's Wave 5. Once Wave 4 is live, the Audit Log will show the per-run Gemini cost and the `plant_care_revisions` table will start collecting history rows.

## App-reference files consulted

- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — confirms `last_freshness_check_at`, `last_care_generated_at`, `freshness_version`, `updated_care_fields`, `forked_from_plant_id`, the dedup indexes, and the three Wave 1 tables (`plant_care_revisions`, `user_plant_ack`, `ai_plant_manual_refresh_log`).
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — confirms the function naming convention (kebab-case), the `_shared/` import pattern, and the AI/Cron section we'll add a row to.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — confirms the `pg_cron` + `pg_net` pattern, the `cron_run_logs` table, the "off-peak" 03:00 UTC convention used by `purge-stale-species-cache`, and the "per-cron failure isolation" rule (a bad plant must not tank the whole batch).
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — confirms the `CARE_GUIDE_SCHEMA` enum-constrained shape we keep (Spring/Summer/Autumn/Winter + Jan…Dec) and the `callGeminiCascade` + `responseSchema` pattern.
- [docs/plans/ai-plant-overhaul.md §7 cron + §6 edge fn + §13 backfill](./ai-plant-overhaul.md) — the original design. This Wave 4 plan executes §7 (cron) and §13 Pass 1's `last_care_generated_at` backfill condition. Pass 2 of §13 (per-home duplicate collapse) is deliberately deferred — it's only useful once we have multiple homes contributing duplicates, which is post-launch.

## What lands in this wave

### 1. New edge function — `supabase/functions/refresh-stale-ai-plants/index.ts`

Modelled on `supabase/functions/manual-refresh-ai-plant/index.ts` — same `CARE_GUIDE_SCHEMA`, same diff-via-`diffCareGuide`, same revision-insert + version-bump pattern. Differences:

- **No JWT, no tier gate, no rate limit.** Called from cron only — header check on a shared secret (matches existing cron functions, see `purge-stale-species-cache`).
- **Batch loop.** Reads `STALE_CHECK_BATCH_SIZE` env (default `25`). Pulls the oldest-checked rows first.
- **Selection filter.** Always:
  ```ts
  .eq("source", "ai")
  .is("home_id", null)            // global rows only — forks are skipped
  .or(`last_freshness_check_at.is.null,last_freshness_check_at.lt.${ninetyDaysAgoIso}`)
  .order("last_freshness_check_at", { ascending: true, nullsFirst: true })
  .limit(BATCH_SIZE);
  ```
- **Per-plant try/catch.** A single bad plant logs to Sentry + `cron_run_logs` and moves on; the rest of the batch still runs.
- **Idempotency.** `last_freshness_check_at` is updated **only after** the diff + (conditional) update succeed. If the function crashes mid-batch, the next run picks up where it left off because the unprocessed plants still have their old `last_freshness_check_at`.
- **Rate limiting against Gemini.** `await sleep(1000)` between plant iterations. Matches the design plan's "stay under provider limits" note. Cheap; the batch is 25, so worst case +25s of run time.
- **System AI-usage attribution.** `logAiUsage(..., { homeId: null, userId: null, functionName: "refresh-stale-ai-plants", action: "stale_check", usage })` — falls under the existing "system" sentinel (both NULL).
- **Revision audit row source.** `source: "stale_check"` (already an allowed value on the `plant_care_revisions.source` CHECK constraint from Wave 1). `triggered_by: null` (cron, no user).
- **Run summary log.** End of run logs `{ examined, changed, unchanged, errors, batchSize }` so we can monitor via `cron_run_logs`.

### 2. New cron migration — `supabase/migrations/20260621000000_refresh_stale_ai_plants_cron.sql`

Schedule pattern matches `20260503090000_purge_species_cache_cron.sql`:

```sql
select cron.schedule(
  'refresh-stale-ai-plants-daily',
  '0 3 * * *',                 -- 03:00 UTC, same off-peak window as purge-species-cache
  $$
  select net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-stale-ai-plants',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <publishable>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

The cron schedule will be `'0 3 * * *'` (daily). Both purge-species-cache and this new stale-check fire in the same minute — they touch different tables, so no contention.

### 3. Backfill migration — `supabase/migrations/20260621000100_ai_plant_overhaul_wave4_backfill.sql`

Populates `last_care_generated_at` from `created_at` for any global AI rows where it's NULL — gives the cron a sensible "age" so it doesn't immediately re-check rows that were inserted yesterday.

```sql
UPDATE public.plants
   SET last_care_generated_at = created_at
 WHERE source = 'ai'
   AND home_id IS NULL
   AND last_care_generated_at IS NULL;
```

Leaves `last_freshness_check_at` deliberately NULL — that's the signal the cron uses to pick these up on the next run. (NULL > 90 days "stale" wins under the `nullsFirst: true` order.)

### 4. Configurable env var

`STALE_CHECK_BATCH_SIZE` — set on the Supabase edge function. Default 25 if unset. Document in the function's header comment + in the new cron-jobs.md row. The plan ramps this:
- First production run: start at `10` (cheap dry-run; check the cost in Audit Log).
- After one successful run, bump to `25`.
- Bumping is a Supabase Dashboard env change, no redeploy needed.

### 5. Deno test — `supabase/tests/refresh-stale-ai-plants.test.ts`

The edge function lives in Deno so it gets a Deno test, not a Vitest one. Covers:

- **`changed = true` path** — given an "old" `care_guide_data` and a Gemini stub returning a new one with one differing field, we insert a `plant_care_revisions` row, bump `freshness_version`, and stamp `updated_care_fields`.
- **`changed = false` path** — given identical input/output, we update `last_freshness_check_at` only — no revision row, no version bump.
- **Fork skip** — a row with `home_id IS NOT NULL` is not selected even if its `last_freshness_check_at` is ancient.
- **Idempotency under crash** — when the Gemini call throws on row 2 of 3, row 1 finishes cleanly, row 2's `last_freshness_check_at` stays untouched (so it's picked up next run), row 3 continues processing.
- **Batch size respected** — given 50 candidates and `STALE_CHECK_BATCH_SIZE=10`, only 10 plants are processed in one run.

Gemini is stubbed via a function reference (matches the pattern already used in `_shared/` tests). Supabase client is the existing in-memory mock from `supabase/tests/utils`.

### 6. Docs updates

In the **same commit** as the function + cron:

- **[99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)** — add `refresh-stale-ai-plants` row under both "AI — Plant Doctor / Identification" (under the existing `manual-refresh-ai-plant` row) and "Cron / scheduled" tables. Cross-link to cron-jobs.md.
- **[99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md)** — add row to the quick-summary table + a "Refresh Stale AI Plants" entry that mentions the 90-day cadence (per-plant, not the cron's daily fire), the `STALE_CHECK_BATCH_SIZE` env, and the `is_global_only` (`home_id IS NULL`) filter.
- **[99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md)** — under "AI catalogue columns", clarify that `last_freshness_check_at` is the cron's selection key + idempotency lock; mention that the Wave 4 backfill seeds `last_care_generated_at` from `created_at`.
- **[docs/plans/ai-plant-overhaul.md](./ai-plant-overhaul.md)** — mark Wave 4 shipped with the file paths and the live cron name.

## Out of scope for Wave 4 (deferred)

- **No UI** for the freshness chip, per-field highlight, or "Updated" badge. That's Wave 5.
- **Pass 2 of the §13 backfill** — per-home duplicate collapse — is deliberately deferred. We don't have multiple homes contributing duplicates yet, and the collapse logic is meaningfully complex (per-row diff, repoint inventory, seed acks) and risk-prone. Worth doing as a one-shot script when we have real production data to validate against.
- **`useAiPlantFreshness` hook** — kept with Wave 5 (where the chip UI consumes it).

## Files modified / created

| File | Type | Notes |
|------|------|-------|
| `supabase/functions/refresh-stale-ai-plants/index.ts` | new | The cron edge function. |
| `supabase/migrations/20260621000000_refresh_stale_ai_plants_cron.sql` | new | `pg_cron` schedule entry. |
| `supabase/migrations/20260621000100_ai_plant_overhaul_wave4_backfill.sql` | new | `last_care_generated_at` backfill. |
| `supabase/tests/refresh-stale-ai-plants.test.ts` | new | Deno tests (5 cases listed above). |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | edit | Add function entry. |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | edit | Add cron entry. |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | edit | Clarify `last_freshness_check_at` role. |
| `docs/plans/ai-plant-overhaul.md` | edit | Mark Wave 4 shipped. |

## Process / verification

1. Write the edge function + the two migrations.
2. Apply migrations **locally first** (`supabase migration up`) before any push to remote, per CLAUDE.md.
3. Write the Deno test, run via `npm run test:functions`. Target: all 5 cases pass.
4. Smoke-test the edge function locally with one synthetic global AI row (manually `UPDATE plants SET last_freshness_check_at = NULL WHERE id = X`), then `supabase functions invoke refresh-stale-ai-plants`. Verify: revision row appears OR `last_freshness_check_at` updated.
5. Update docs in the same task.
6. Typecheck (`npx tsc --noEmit`) + Deno tests both clean.
7. Commit + push with `[skip ci]` (Vercel pause is on but the marker is good practice).
8. Stop and summarise. **No remote `db push` and no cron activation on remote until user confirms** — the cron migration won't fire on remote until that push happens.

## Risk register

| Risk | Mitigation |
|------|------------|
| Gemini returns subtly different but semantically identical data (case, ordering) | `diffCareGuide` already normalises (lowercase strings, sort arrays). Existing helper is shared with the manual-refresh function. |
| First run discovers 1000 stale rows and racks up cost | Batch size caps each run at 25. With 1 run/day that's max 25 × 90 days = 2,250 unique global plants/year. Quota math is fine; ramp from 10 → 25 lets us see cost before committing. |
| Cron fires before the backfill migration applies on remote | Apply backfill in the same `npm run deploy` as the cron migration. Migrations run first in the deploy script. |
| The function silently fails on remote (no logs) | `logError` writes to Sentry; `cron_run_logs` row is written at the end of each run with `{ examined, changed, unchanged, errors }`. |
| `STALE_CHECK_BATCH_SIZE` env not set on remote | Default `25` in code. Function works even if the env is absent. |
| A fork row accidentally gets picked up | The selection filter is `is("home_id", null)`. Forks always have `home_id != null` by construction. Deno test "fork skip" explicitly verifies this. |
| Concurrent run picks the same plants | Cron schedule fires once/day; concurrency window is minutes. Even if two invocations did overlap, the `last_freshness_check_at` update happens only after the per-plant work is done, so the second invocation would re-process the same plants but the second update would just overwrite the first (idempotent). |
