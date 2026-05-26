-- Plant Library — raise schedule count_per_run cap to 10,000
--
-- Submit-plant-library-batch's MAX_COUNT was bumped to 10000 in
-- the previous release, but plant_library_run_schedules still had
-- a CHECK constraint capping count_per_run at 5000 from its
-- original migration. Inserting a schedule with count_per_run >
-- 5000 hit a Postgres 23514 constraint violation and surfaced
-- as "couldn't schedule batch — Unknown error" in the admin UI.
--
-- New cap matches the edge-fn cap so the two stay in lockstep.

ALTER TABLE public.plant_library_run_schedules
  DROP CONSTRAINT IF EXISTS plant_library_run_schedules_count_per_run_check;

ALTER TABLE public.plant_library_run_schedules
  ADD CONSTRAINT plant_library_run_schedules_count_per_run_check
  CHECK (count_per_run > 0 AND count_per_run <= 10000);
