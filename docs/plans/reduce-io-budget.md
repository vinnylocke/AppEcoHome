# Plan — Reduce Supabase Disk IO Budget consumption

## Problem
Supabase IO budget alerts firing even when the app is idle. Diagnosis: cron jobs running too frequently + unbounded `net._http_response` + `cron.job_run_details` table bloat from those crons.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` (out-of-date — does NOT match real migrations; only the affected rows will be updated here)

## Changes
Single migration file `supabase/migrations/<timestamp>_reduce_io_budget.sql` that:

1. Reschedules `plant-library-schedule-tick` from `* * * * *` (every minute, 1440/day) → `*/5 * * * *` (every 5 min, 288/day). 80% reduction.
2. Unschedules `pattern-scan-6h` (`0 */6 * * *`, 4/day) → schedules `pattern-scan-8h` (`0 */8 * * *`, 3/day).
3. Unschedules `pattern-evaluate-6h` (`30 */6 * * *`) → schedules `pattern-evaluate-8h` (`30 */8 * * *`).
4. Schedules a new daily cron `prune-system-logs-daily` at 04:45 UTC that runs:
   - `DELETE FROM net._http_response WHERE created < now() - interval '3 days';`
   - `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';`

No application code touched. Migration only.

## Notes
- The prune cron's first run may be slow (catches the backlog). Subsequent runs trivial.
- Skipping `run-automations` cadence changes — function matches automations by `currentHour`, so every 30 min would double IO with no behavioural change. Confirmed via reading `supabase/functions/run-automations/index.ts:713-741`.

## App-reference docs to update
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — update the three affected rows (`pattern-scan`, `pattern-evaluate`, and the inaccurate `Run Automations | every minute` row) and add the new prune cron.

## Risks
- The DELETE on `net._http_response` may block writes briefly while pg_net is logging new responses. Mitigated by running daily at 04:45 UTC (quiet time) and bounded by 3-day retention so the working set stays small after the first run.
- The cron user (`postgres`) has sufficient privileges to DELETE from both `net._http_response` and `cron.job_run_details` on Supabase managed Postgres.

## Process
1. Apply migration locally with `supabase migration up`.
2. Push to remote with `supabase db push` on user confirmation.
