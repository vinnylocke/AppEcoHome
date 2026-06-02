-- ─── Normalize legacy 'Harvest' → 'Harvesting' ────────────────────────────
--
-- Until now the codebase carried two synonyms for the same concept:
--   • 'Harvesting' — used by plantScheduleFactory and the constraint
--   • 'Harvest'    — used by Save-to-Shed and Companion Plants (legacy)
--
-- Two labels for the same dot on the calendar, two filter buckets, two
-- code paths in every harvest-aware helper. Vinny asked for one
-- canonical name. We pick 'Harvesting' because it matches everything
-- created by plantScheduleFactory + the Wave-20 window engine, and it's
-- already the user-facing label on the type filter.
--
-- Three places hold the value:
--   1. public.tasks.type
--   2. public.task_blueprints.task_type
--   3. public.plant_schedules.task_type  (template that seeds blueprints)
--
-- The constraint on public.tasks still allows BOTH values for now —
-- we don't drop 'Harvest' from the CHECK because (a) the offline queue
-- and any pre-deploy clients might still produce a 'Harvest' row, and
-- (b) the post-deploy code keeps a defensive `IN ('Harvest',
-- 'Harvesting')` so either value remains functional. The label
-- duplication issue is purely a data problem and this UPDATE solves it.

UPDATE public.tasks
   SET type = 'Harvesting'
 WHERE type = 'Harvest';

UPDATE public.task_blueprints
   SET task_type = 'Harvesting'
 WHERE task_type = 'Harvest';

UPDATE public.plant_schedules
   SET task_type = 'Harvesting'
 WHERE task_type = 'Harvest';
