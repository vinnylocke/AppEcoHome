-- Repoint the 5-min automation cron at the renamed `evaluate-automations`
-- function (was `evaluate-sensor-automations`). Phase 3 cleanup (2026-06-18).
--
-- The new function is deployed BEFORE this migration applies, so there is no
-- firing gap. Idempotent: unschedules the old job only if present.

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'evaluate-sensor-automations-5min';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'evaluate-automations-5min';
END $$;

SELECT cron.schedule(
  'evaluate-automations-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/evaluate-automations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
