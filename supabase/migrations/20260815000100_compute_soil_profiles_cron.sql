-- Daily cron — recompute every soil sensor's moisture-behaviour profile
-- (Pillar A of the automation-intelligence feature). Deterministic, no AI.
-- See docs/plans/automation-intelligence-and-soil-drydown.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'compute-soil-profiles-daily',
  '0 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/compute-soil-profiles',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
