-- Daily cron job to delete species_cache entries that are older than 30 days
-- and no longer referenced by any plant. Runs at 03:00 UTC to avoid peak hours.
-- The function itself uses SUPABASE_SERVICE_ROLE_KEY to bypass the missing
-- DELETE RLS policy on species_cache.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'purge-species-cache-daily',
  '0 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/purge-stale-species-cache',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
