-- AI Plant Overhaul Wave 4 — backfill `last_care_generated_at`
--
-- Seeds `last_care_generated_at` from `created_at` for every existing
-- global AI plant where it's NULL. Gives the stale-check cron a sensible
-- age baseline so it doesn't immediately re-check rows that were inserted
-- yesterday.
--
-- `last_freshness_check_at` is left NULL on purpose — that's the cron's
-- "never checked, pick me up first" signal (NULLS FIRST ordering).
--
-- Idempotent: only updates rows that haven't been touched yet. Safe to
-- re-run.

UPDATE public.plants
   SET last_care_generated_at = created_at
 WHERE source = 'ai'
   AND home_id IS NULL
   AND last_care_generated_at IS NULL;
