-- Weekly cron — regenerate the Head Gardener Estate Report for every Evergreen
-- home (gated inside the function). Reconciles the continuity log first (closing
-- gaps that have gone, opening fresh ones), then refreshes each report when its
-- inputs have changed. Runs Mondays 05:00 UTC, ahead of the grow-suggestions cron.
-- See docs/plans/head-gardener-ai-manager.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'garden-manager-report-weekly',
  '0 5 * * 1',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/garden-manager-report',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"cron": true}'::jsonb
  );
  $$
);
