-- Turn OFF all automated plant-library + ailment-library seeding / verification
-- (owner request, 2026-07-23). On-demand "Seed now" from /admin/plant-library
-- still works (it invokes the edge function directly, not via these crons).
--
-- Each unschedule is guarded by a `cron.job` lookup so it is idempotent and a
-- no-op when the job is absent (e.g. never scheduled on this DB, or already
-- removed). `cron.unschedule(jobid)` is invoked once per matching row.

-- ── Recurring seed / verify crons ───────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plant-library-verify-daily';   -- verifies plants
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'seed-ailment-library-weekly';   -- adds ailments
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'verify-ailment-library-weekly'; -- verifies ailments
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plant-library-seed-daily';      -- adds plants (already removed; belt-and-braces)

-- ── Admin scheduled / batch seeding machinery (adds plants) ─────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plant-library-schedule-tick';   -- fires plant_library_run_schedules
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plant-library-batches-poll';     -- processes plant_library_batches into new plants

-- ── Neutralise any in-flight admin schedules / batches so nothing re-adds ────
-- plants after the crons are gone. (Prod today: 0 active schedules, 4 batches
-- in 'succeeded' that the poll would otherwise process into new plants.)
UPDATE public.plant_library_run_schedules
SET status = 'cancelled'
WHERE status = 'active';

UPDATE public.plant_library_batches
SET status = 'cancelled'
WHERE status IN ('submitting', 'pending', 'running', 'succeeded');
