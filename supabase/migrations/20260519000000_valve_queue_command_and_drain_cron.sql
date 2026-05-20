-- ── automation_valve_queue: add command column ────────────────────────────────
-- Needed so drain logic can send explicit turn_off commands to eWeLink
-- instead of relying on the countdown parameter (which is silently ignored
-- by sub-devices).
--
-- Wrapped in IF EXISTS so this migration is safe on a fresh DB where
-- automation_valve_queue (created later in 20260530000000_automations.sql)
-- doesn't exist yet. The catch-up migration 20260606000000 re-applies the
-- column add after automation_valve_queue is created.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'automation_valve_queue'
  ) THEN
    ALTER TABLE automation_valve_queue
      ADD COLUMN IF NOT EXISTS command TEXT NOT NULL DEFAULT 'turn_on'
        CHECK (command IN ('turn_on', 'turn_off'));
  ELSE
    RAISE NOTICE 'automation_valve_queue not yet created — column add deferred to 20260606000000_ordering_bug_fixups.sql';
  END IF;
END $$;

-- ── pg_cron: drain valve queue every 5 minutes ───────────────────────────────
-- The hourly run-automations already drains pending queue entries, but valves
-- need to turn off within minutes of their duration ending, not within an hour.
-- This 5-minute cron ensures turn-off entries fire promptly.
-- Automations are gated by last_run_date so extra ticks won't double-fire them.
--
-- The cron call hits the production edge function URL, so on a local DB where
-- pg_cron may not be configured (or where we don't want local cron firing
-- against prod), this is wrapped in a try/catch. Failure is non-fatal.

DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
    FROM cron.job
   WHERE jobname = 'drain-valve-queue-5min';

  PERFORM cron.schedule(
    'drain-valve-queue-5min',
    '*/5 * * * *',
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
    RAISE NOTICE 'pg_cron not available or insufficient privileges — drain cron skipped';
  WHEN OTHERS THEN
    RAISE NOTICE 'drain cron scheduling failed (non-fatal): %', SQLERRM;
END $$;
