-- Plant Library — daily seed + verify crons
--
-- Schedule:
--   02:00 UTC  →  seed-plant-library with count = 1000
--   04:00 UTC  →  verify-plant-library with count = 2000  (catch up the
--                 previous run + any leftover unverified rows)
--
-- Split into two crons rather than chaining inside one cron because a
-- slow verify pass should never block the next day's seed. Each cron
-- inserts its own `plant_library_runs` row internally so the admin UI
-- shows them as distinct entries.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'plant-library-seed-daily',
  '0 2 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/seed-plant-library',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"count": 1000}'::jsonb
  );
  $$
);

select cron.schedule(
  'plant-library-verify-daily',
  '0 4 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/verify-plant-library',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"count": 2000}'::jsonb
  );
  $$
);
