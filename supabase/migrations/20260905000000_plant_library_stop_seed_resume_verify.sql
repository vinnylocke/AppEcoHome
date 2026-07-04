-- Plant Library cron rebalance — stop seeding, resume verifying.
--
-- The library has enough plants now, so the automatic daily SEED cron is no
-- longer wanted (new plants can still be added on demand from
-- /admin/plant-library). The daily VERIFY cron — paused back in June
-- (20260624001300) while we focused on populating — is turned back on so the
-- library gets cross-checked. The soil-requirements backfill cron
-- (20260903000000, 03:45 UTC) is unaffected and keeps running.
--
-- Idempotent: each unschedule is guarded on cron.job so re-running is safe.

-- 1. Remove the automatic daily seeder (was 02:00 UTC, count 1000).
SELECT cron.unschedule('plant-library-seed-daily')
FROM cron.job WHERE jobname = 'plant-library-seed-daily';

-- 2. Re-enable the daily verify (04:00 UTC, count 2000) — same definition as
--    the original in 20260624001000. Unschedule-if-exists first so re-running
--    this migration can't create a duplicate job.
SELECT cron.unschedule('plant-library-verify-daily')
FROM cron.job WHERE jobname = 'plant-library-verify-daily';

SELECT cron.schedule(
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
