-- ── automation_valve_queue: add command column ────────────────────────────────
-- Needed so drain logic can send explicit turn_off commands to eWeLink
-- instead of relying on the countdown parameter (which is silently ignored
-- by sub-devices).

ALTER TABLE automation_valve_queue
ADD COLUMN IF NOT EXISTS command TEXT NOT NULL DEFAULT 'turn_on'
  CHECK (command IN ('turn_on', 'turn_off'));

-- ── pg_cron: drain valve queue every 5 minutes ───────────────────────────────
-- The hourly run-automations already drains pending queue entries, but valves
-- need to turn off within minutes of their duration ending, not within an hour.
-- This 5-minute cron ensures turn-off entries fire promptly.
-- Automations are gated by last_run_date so extra ticks won't double-fire them.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'drain-valve-queue-5min';

SELECT cron.schedule(
  'drain-valve-queue-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
