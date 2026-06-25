-- Valve duration precision (2026-06-25).
--
-- Two fixes for "automation set to 5 min ran the valve for ~10 min":
--   1. Add a transient 'firing' status so the drain can atomically CLAIM a queue
--      entry before hitting the device — stops the inline drain (evaluate-
--      automations) and the cron drain from both firing the same turn_on (the
--      double-fire seen in valve_events).
--   2. Reschedule the valve-queue drain from every 5 min to every 1 min, so a
--      queued auto-close fires within ~1 min of its due time (a 5-min valve runs
--      ~5–6 min instead of up to 10). The drain is a light "fire what's due" pass.

ALTER TABLE public.automation_valve_queue DROP CONSTRAINT IF EXISTS automation_valve_queue_status_check;
ALTER TABLE public.automation_valve_queue ADD CONSTRAINT automation_valve_queue_status_check
  CHECK (status IN ('pending', 'firing', 'fired', 'failed'));

-- ── Reschedule the drain cron: 5 min → 1 min ──
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'drain-valve-queue-5min';
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'drain-valve-queue-1min';

  PERFORM cron.schedule(
    'drain-valve-queue-1min',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
      headers:='{"Content-Type": "application/json"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
    $cron$
  );
EXCEPTION
  WHEN undefined_function OR insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'pg_cron not available — drain cron reschedule skipped';
  WHEN OTHERS THEN
    RAISE NOTICE 'drain cron reschedule failed (non-fatal): %', SQLERRM;
END $$;
