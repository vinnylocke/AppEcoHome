-- Ailment Library seed cron (Phase 1b, 2026-06-18).
--
-- Weekly top-up of the ailment catalogue. The seeder excludes ailments already
-- in the library, so over time the catalogue grows then naturally saturates to
-- cheap dedup-skips (the ailment universe is finite, unlike plants). Weekly
-- cadence keeps ongoing AI spend minimal post-saturation. Idempotent re-schedule.

create extension if not exists pg_net;
create extension if not exists pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'seed-ailment-library-weekly';
END $$;

select cron.schedule(
  'seed-ailment-library-weekly',
  '30 3 * * 1',  -- Mondays 03:30 UTC
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/seed-ailment-library',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"count": 10}'::jsonb
  );
  $$
);
