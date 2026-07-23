-- Annual carry-over for seasonal task blueprints (Track B, Phase B1).
--
-- Today task_blueprints store FROZEN absolute single-year dates: once end_date
-- passes, the ghost engine stops and nothing recreates the routine next year.
-- recurrence_kind lets the ghost engine treat the stored start_date/end_date as
-- a TEMPLATE month/day and project one occurrence per year (fixed calendar
-- boundaries), with per-year completion year-scoped by the existing
-- unique_blueprint_date (blueprint_id, due_date) tombstone.
--
-- See docs/plans/seasonal-task-annual-carryover.md.

ALTER TABLE public.task_blueprints
  ADD COLUMN IF NOT EXISTS recurrence_kind text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS recurs_until date;

ALTER TABLE public.task_blueprints
  DROP CONSTRAINT IF EXISTS task_blueprints_recurrence_kind_check;
ALTER TABLE public.task_blueprints
  ADD CONSTRAINT task_blueprints_recurrence_kind_check
  CHECK (recurrence_kind IN ('once', 'annual', 'lifecycle_capped'));

COMMENT ON COLUMN public.task_blueprints.recurrence_kind IS
  'How this blueprint recurs across YEARS. '
  '''once'' = terminal at end_date (default; today''s behaviour + manual one-offs). '
  '''annual'' = start_date/end_date are the TEMPLATE month/day; the ghost engine projects one occurrence per year on the same MM-DD (fixed boundaries), capped at ANNUAL_PROJECTION_MAX_YEARS ahead (src/lib/windowTasks.ts). '
  '''lifecycle_capped'' = annual but stops after recurs_until (e.g. biennials). '
  'Per-year completion is year-scoped by the (blueprint_id, due_date) tombstone. See docs/plans/seasonal-task-annual-carryover.md.';
COMMENT ON COLUMN public.task_blueprints.recurs_until IS
  'Terminal date for recurrence_kind = ''lifecycle_capped'' (NULL = uncapped / annual / once).';

-- Backfill: existing recurring blueprints that carry an end_date are treated as
-- seasonal and set to 'annual' so they repeat next year. This covers the reported
-- cases — harvest/pruning windows ("my strawberry harvest should come back next
-- year") AND seasonal watering (the summer watering routine should reopen each
-- year). Scope widened to include Watering per the owner's decision (2026-07-23):
-- as the app's sole active user with few blueprints they prefer auto-conversion,
-- and any routine that should genuinely stop can be flipped back to 'once' via the
-- "repeat every year" toggle on the edit path (Phase B4). New schedule-generated
-- blueprints get their recurrence_kind from the plant lifecycle at creation (B4).
-- Non-recurring / archived / no-end_date blueprints keep the default 'once'.
UPDATE public.task_blueprints
SET recurrence_kind = 'annual'
WHERE is_recurring = true
  AND COALESCE(is_archived, false) = false
  AND end_date IS NOT NULL
  AND task_type IN ('Harvesting', 'Harvest', 'Pruning', 'Watering');
