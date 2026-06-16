-- 2026-06-16 Phase 3 — cron schedule for sensor-driven automations.
--
-- Every 5 min, pg_cron fires net.http_post → evaluate-sensor-automations.
-- The handler walks every is_active + trigger_kind='sensor_threshold'
-- automation, decides whether to fire via the pure evaluator, and fans
-- out actions (notifications → notifications table, valve commands →
-- automation_valve_queue which the existing drain step picks up).
--
-- 5 min cadence matches the 5-min "drain valve queue" cron in
-- run-automations so a sensor-triggered valve action fires within ~5
-- min of the threshold being crossed (worst case 10 min: 5 min wait
-- for evaluation + 5 min wait for drain). Faster ticks burn API calls
-- without buying anything useful for soil-pace sensors.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'evaluate-sensor-automations-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/evaluate-sensor-automations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
