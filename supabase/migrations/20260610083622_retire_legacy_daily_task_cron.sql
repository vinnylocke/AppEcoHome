-- ─── Retire the legacy daily-task-generator cron ──────────────────────
--
-- BUG: user reported a Harvesting task that was overdue from yesterday;
-- clicked "Not yet" with 3 days; today the canonical window task is
-- correctly hidden by next_check_at = 2026-06-13, but a SECOND
-- harvest task appeared with window_end_date = NULL — and because
-- it lacks the window field, the UI renders it as a "normal" task
-- without the harvest-specific buttons.
--
-- Cause: two crons were generating tasks daily —
--   1. daily-task-generator  (02:00 UTC) → SQL fn generate_daily_tasks()
--   2. generate-tasks-daily  (07:55 UTC) → edge fn `generate-tasks`
--
-- The edge function received Wave 21.0004's fix (skip Harvesting
-- blueprints with end_date — they're owned by the frontend ghost
-- engine + window model). The SQL function never did. It happily
-- created today's harvest task at 02:00 with window_end_date NULL,
-- producing the duplicate the user saw.
--
-- Fix: retire the legacy cron entirely. The edge function at 07:55
-- covers the same surface AND respects the harvest window contract.
-- The SQL function is left in place but patched defensively in case
-- anything else calls it.

-- 1. Drop the cron.
SELECT cron.unschedule('daily-task-generator')
FROM cron.job WHERE jobname = 'daily-task-generator';

-- 2. Patch the SQL function with the harvest-skip filter so any
--    accidental future call is safe.
CREATE OR REPLACE FUNCTION public.generate_daily_tasks()
  RETURNS void
  LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.tasks (
    home_id,
    blueprint_id,
    title,
    description,
    type,
    due_date,
    status,
    location_id,
    area_id,
    inventory_item_ids
  )
  SELECT
    b.home_id,
    b.id,
    b.title,
    b.description,
    b.task_type,
    CURRENT_DATE,
    'Pending',
    b.location_id,
    b.area_id,
    b.inventory_item_ids
  FROM public.task_blueprints b
  WHERE
    b.is_recurring = true
    AND b.start_date <= CURRENT_DATE
    AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
    AND (CURRENT_DATE - b.start_date) % b.frequency_days = 0
    -- Wave 21.0004 invariant: harvest blueprints with end_date are
    -- owned by the frontend ghost engine. Materialising daily tasks
    -- here would shadow the canonical window task.
    AND NOT (b.task_type IN ('Harvesting', 'Harvest') AND b.end_date IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.blueprint_id = b.id AND t.due_date = CURRENT_DATE
    );
END;
$function$;

-- 3. Clean up the user-reported duplicate. There may be other homes
--    with the same issue from today's 02:00 run — wipe every harvest
--    task created today that lacks the window field for a blueprint
--    that DOES have an end_date.
--
-- Guarded against `tasks.window_end_date` not existing yet — the column is
-- added later in 20260702000000_tasks_window_end_date.sql. On a fresh
-- chronological reset the column is absent at this point and this cleanup
-- has no rows to delete anyway (empty tasks table). On databases that ran
-- this migration in commit order, the column already existed and the
-- DELETE ran as intended.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'tasks'
       AND column_name  = 'window_end_date'
  ) THEN
    DELETE FROM public.tasks t
    WHERE t.type IN ('Harvesting', 'Harvest')
      AND t.window_end_date IS NULL
      AND t.status = 'Pending'
      AND t.created_at >= CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM public.task_blueprints b
        WHERE b.id = t.blueprint_id
          AND b.end_date IS NOT NULL
      );
  END IF;
END $$;
