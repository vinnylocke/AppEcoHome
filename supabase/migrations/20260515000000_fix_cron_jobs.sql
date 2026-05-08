-- ============================================================
-- Cron job audit & cleanup
--
-- Problems fixed:
--   1. sync-weather was registered twice (once via migration, once manually
--      from the Supabase dashboard at 2am). The 2am job was hitting
--      verify_jwt=false but with no auth header → 401.
--      Fix: drop ALL cron jobs whose SQL calls sync-weather, then re-create
--      exactly one at 1am.
--
--   2. generate-tasks edge function existed but had no cron job scheduling
--      it. Add a daily job at 07:55 UTC (5 min before notifications at 08:00)
--      so physical tasks are materialised before the notification batch runs.
-- ============================================================

-- 1. Remove every cron job that calls sync-weather (catches manual entries too)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE command LIKE '%/sync-weather%';

-- Re-create the single authoritative sync-weather job at 01:00 UTC daily.
-- sync-weather is deployed with verify_jwt=false so no Authorization header needed.
SELECT cron.schedule(
  'sync-weather-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/sync-weather',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- 2. Create generate-tasks cron (daily at 07:55 UTC, before the 08:00 notifications).
-- generate-tasks is deployed with verify_jwt=false so no Authorization header needed.
SELECT cron.unschedule('generate-tasks-daily')
FROM cron.job
WHERE jobname = 'generate-tasks-daily';

SELECT cron.schedule(
  'generate-tasks-daily',
  '55 7 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-tasks',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
