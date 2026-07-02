-- Restore the 60s pg_net timeout on the 1-minute valve drain cron
-- (bug-audit-2026-07-02 §7.2).
--
-- 20260826000000_valve_drain_precision.sql rescheduled the drain from 5 min
-- to 1 min but posted without timeout_milliseconds — falling back to
-- pg_net's 5s default, the exact silent-timeout failure
-- 20260608134343_cron_extend_all_pg_net_timeouts.sql fixed fleet-wide. The
-- drain routinely exceeds 5s (fireValve has a 10s retry sleep plus several
-- DB round-trips per entry), and a timeout mid-drain is precisely the crash
-- window that used to strand claimed 'firing' rows.
--
-- Identical job to 20260826000000 except for timeout_milliseconds.

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'drain-valve-queue-1min';

  PERFORM cron.schedule(
    'drain-valve-queue-1min',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
      headers:='{"Content-Type": "application/json"}'::jsonb,
      body:='{}'::jsonb,
      timeout_milliseconds:=60000
    ) AS request_id;
    $cron$
  );
EXCEPTION
  WHEN undefined_function OR insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'pg_cron not available — drain cron reschedule skipped';
  WHEN OTHERS THEN
    RAISE NOTICE 'drain cron reschedule failed (non-fatal): %', SQLERRM;
END $$;
