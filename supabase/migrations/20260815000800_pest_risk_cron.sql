-- Weekly cron — regenerate AI pest/disease risk insights for homes that track
-- pests + grow plants they affect (Evergreen-gated inside the function).
-- Also invoked on-demand when a user links an ailment to a plant.
-- See docs/plans/ai-insights-overhaul.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'generate-pest-risk-weekly',
  '0 5 * * 1',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-pest-risk',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
