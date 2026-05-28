-- Reduce Supabase Disk IO Budget consumption.
--
-- Background: the per-minute `plant-library-schedule-tick` cron + unbounded
-- growth of `net._http_response` and `cron.job_run_details` were the main
-- IO consumers during idle periods.
--
-- Changes:
--   1. `plant-library-schedule-tick`: every minute → every 5 minutes
--   2. `pattern-scan-6h` → `pattern-scan-8h` (every 6h → every 8h)
--   3. `pattern-evaluate-6h` → `pattern-evaluate-8h` (every 6h → every 8h, +30 offset)
--   4. New `prune-system-logs-daily` cron that trims `net._http_response`
--      to 3 days and `cron.job_run_details` to 7 days.

-- ── 1. plant-library-schedule-tick: every minute → every 5 minutes ──────────
-- The schedule tick walks `plant_library_run_schedules` for due rows. When
-- there are no active schedules (the common case), it was still running 1440
-- times a day. Five-minute cadence trims this to 288/day (-80%) while keeping
-- a worst-case 4-minute slippage on user-queued schedules — acceptable for
-- a long-running plant-library backfill that already takes hours.
SELECT cron.unschedule('plant-library-schedule-tick');

SELECT cron.schedule(
  'plant-library-schedule-tick',
  '*/5 * * * *',
  $$SELECT public.tick_plant_library_schedules();$$
);

-- ── 2. pattern-scan: every 6h → every 8h ────────────────────────────────────
-- Insight refresh latency goes from 6h → 8h; pattern detection isn't time-
-- sensitive enough to justify the IO. Renaming the cron so its name reflects
-- the new cadence.
SELECT cron.unschedule('pattern-scan-6h');

SELECT cron.schedule(
  'pattern-scan-8h',
  '0 */8 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-scan',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- ── 3. pattern-evaluate: every 6h → every 8h, +30 min offset ────────────────
-- Stays paired with pattern-scan — runs 30 min after each scan so the scan
-- has time to land its `pattern_hits` rows before evaluate scores them.
SELECT cron.unschedule('pattern-evaluate-6h');

SELECT cron.schedule(
  'pattern-evaluate-8h',
  '30 */8 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-evaluate',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- ── 4. Daily prune of pg_net + pg_cron log tables ───────────────────────────
-- `net._http_response` logs every HTTP response from cron-issued POSTs and
-- is NOT auto-vacuumed. Without pruning it grows unbounded — directly
-- inflating IO budget via reads (for autovacuum) and writes (each cron call).
-- Same story for `cron.job_run_details`.
--
-- Retention: 3 days for HTTP responses (debug-only data), 7 days for cron
-- run details (enough to investigate a few days of cron failures).
--
-- Cadence: daily at 04:45 UTC — quiet window between
-- refresh-stale-grow-guides-daily (03:30) and refresh-seasonal-picks-weekly
-- (Mon 04:00) / plant-library-verify-daily (04:00).
--
-- First-run note: the initial firing will catch the historical backlog and
-- may take a while. Subsequent runs are trivial because daily inflow is
-- bounded by total cron cadence × retention.
SELECT cron.schedule(
  'prune-system-logs-daily',
  '45 4 * * *',
  $$
  DELETE FROM net._http_response WHERE created < now() - interval '3 days';
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  $$
);
