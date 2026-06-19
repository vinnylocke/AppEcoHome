-- Notification timing (2026-06-19): run the notification batch every 15 min
-- instead of once at 08:00 UTC, so `daily-batch-notifications` can deliver each
-- user's task digest at their chosen local reminder time and fire golden hour
-- ~45 min before each home's actual sunset. The function self-gates per
-- user/home, so most ticks are cheap no-ops (tasks are only fetched for homes
-- with a due member).

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-8am-batch';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-notifications-15min';
END $$;

SELECT cron.schedule(
  'daily-notifications-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/daily-batch-notifications',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
