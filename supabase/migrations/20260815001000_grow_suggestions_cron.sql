-- Weekly cron — regenerate AI "what to grow + tasks you might be missing"
-- suggestions for Evergreen homes (gated inside the function). Runs Mondays,
-- after seasonal picks. Also invokable on-demand with { homeId }.
-- See docs/plans/ai-insights-overhaul.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'generate-grow-suggestions-weekly',
  '0 6 * * 1',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-grow-suggestions',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
