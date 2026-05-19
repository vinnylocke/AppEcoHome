-- ============================================================
-- BLUEPRINT PAUSE (Phase 2 Wave 3)
-- Lets users temporarily disable a recurring task schedule
-- (e.g. away on holiday, ground frozen, plant dormant).
-- TaskEngine.fetchTasksWithGhosts respects paused_until when
-- generating virtual task instances.
-- ============================================================

ALTER TABLE public.task_blueprints
  ADD COLUMN IF NOT EXISTS paused_until timestamptz;

COMMENT ON COLUMN public.task_blueprints.paused_until IS
  'When set, no ghost tasks are generated for this blueprint until this time. Null = active. Past timestamp = active (auto-resume).';

CREATE INDEX IF NOT EXISTS idx_task_blueprints_paused
  ON public.task_blueprints (paused_until)
  WHERE paused_until IS NOT NULL;
