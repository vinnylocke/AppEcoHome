-- Plant Library — pause the daily verify cron
--
-- The user has decided to focus on populating the database first,
-- verifying later when there's a critical mass of data. The
-- `verify-plant-library` edge function stays deployed so admin can
-- still trigger manual verify runs from /admin/plant-library, but
-- the cron schedule is removed.
--
-- The seed cron (`plant-library-seed-daily`, 02:00 UTC, count=1000)
-- is unaffected.
--
-- Wrapped in a conditional so re-running the migration on a fresh
-- DB (where the job never existed) doesn't error out.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'plant-library-verify-daily') THEN
    PERFORM cron.unschedule('plant-library-verify-daily');
  END IF;
END $$;
