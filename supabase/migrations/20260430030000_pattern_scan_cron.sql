-- Runs pattern-scan every 6 hours.
-- Replace YOUR_PROJECT_REF and YOUR_ANON_KEY before pushing to remote.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'pattern-scan-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-scan',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
