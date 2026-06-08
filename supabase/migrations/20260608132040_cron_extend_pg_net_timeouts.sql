-- ─── Extend pg_net timeouts on the slow user-facing crons ──────────────
--
-- pg_net's net.http_post defaults to a 5-second timeout. Several of our
-- edge functions take longer than that to complete (especially the
-- weekly/daily aggregators which loop over every home). When pg_net
-- gives up at 5s, the cron is logged as "succeeded" in cron.job_run_
-- details but the function itself never finishes — silent failure.
--
-- Concrete evidence: generate-weekly-overviews fired on 2026-06-07 at
-- 06:00 UTC but no rows landed in weekly_overviews for that day.
-- net._http_response showed a 5s timeout.
--
-- This migration reschedules the three most user-visible crons with
-- explicit `timeout_milliseconds:=60000` (60 seconds). Other slow-cron
-- candidates (pattern-evaluate-8h, garden-reports-monthly, etc.) can be
-- migrated similarly when they show up in the silent-failure logs.

-- ─── generate-weekly-overviews ─────────────────────────────────────────
SELECT cron.unschedule('generate-weekly-overviews')
FROM cron.job WHERE jobname = 'generate-weekly-overviews';

SELECT cron.schedule(
  'generate-weekly-overviews',
  '0 6 * * 0',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-weekly-overviews',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
  $$
);

-- ─── weekly-optimise-digest ────────────────────────────────────────────
SELECT cron.unschedule('weekly-optimise-digest')
FROM cron.job WHERE jobname = 'weekly-optimise-digest';

SELECT cron.schedule(
  'weekly-optimise-digest',
  '0 7 * * 0',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/weekly-optimise-digest',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
  $$
);

-- ─── daily-8am-batch (daily-batch-notifications) ───────────────────────
-- This is the Golden Hour cron. The function does a full sweep of homes,
-- pending tasks, members, and prefs — easily >5s on busy days.
SELECT cron.unschedule('daily-8am-batch')
FROM cron.job WHERE jobname = 'daily-8am-batch';

SELECT cron.schedule(
  'daily-8am-batch',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/daily-batch-notifications',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
  $$
);
