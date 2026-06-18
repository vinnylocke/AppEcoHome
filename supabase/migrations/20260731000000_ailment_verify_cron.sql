-- Ailment Library verify cron (Phase 3, 2026-06-18).
--
-- Weekly self-critique pass over unverified rows (accuracy + completeness + safe
-- treatment advice). Runs Tuesdays, a day after the Monday seeder, so it picks
-- up the week's new entries. Default-passes nothing — only marks rows it reviews.

create extension if not exists pg_net;
create extension if not exists pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'verify-ailment-library-weekly';
END $$;

select cron.schedule(
  'verify-ailment-library-weekly',
  '30 4 * * 2',  -- Tuesdays 04:30 UTC
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/verify-ailment-library',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"count": 12}'::jsonb
  );
  $$
);
