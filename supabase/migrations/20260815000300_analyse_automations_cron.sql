-- Daily cron — analyse every active automation against its run history + the
-- soil-moisture model and (re)generate automation_suggestions. Deterministic.
-- Runs 30 min after compute-soil-profiles so the profiles are fresh.
-- See docs/plans/automation-intelligence-and-soil-drydown.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'analyse-automations-daily',
  '30 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/analyse-automations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
