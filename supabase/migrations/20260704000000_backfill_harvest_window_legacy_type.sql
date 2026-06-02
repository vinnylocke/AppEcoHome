-- ─── Backfill: legacy `Harvest` (no -ing) tasks → window model ─────────────
--
-- Tasks created via the "Save to Shed" path and the Companion Plants tab
-- use `task_type = 'Harvest'` (legacy naming), whereas plantScheduleFactory
-- and everything Wave-20 onwards uses `'Harvesting'`. The original
-- Wave-20.1 backfill (20260703000000_backfill_harvest_window_tasks.sql)
-- only targeted `'Harvesting'`, so existing tasks created via the legacy
-- paths kept piling up under the daily-cadence model and never received
-- a `window_end_date`. That made them invisible to the harvest-window
-- tint AND to every Wave-20 "in-window" affordance in the task modal.
--
-- This migration is a verbatim mirror of 20260703000000 but for legacy
-- 'Harvest' (no -ing) tasks. Same steps:
--   1. Backfill window_end_date from the parent blueprint's end_date.
--   2. Collapse per-day duplicates per (blueprint_id, window_end_date)
--      group — keep the earliest matching task, mark the rest as Skipped.
--
-- Idempotent: re-running is a no-op because Step 1 only touches rows
-- with `window_end_date IS NULL`, and Step 2 only marks rows whose
-- status is still 'Pending'.

-- ── Step 1 — Backfill window_end_date ─────────────────────────────────────
UPDATE public.tasks t
   SET window_end_date = b.end_date
  FROM public.task_blueprints b
 WHERE t.blueprint_id = b.id
   AND t.window_end_date IS NULL
   AND t.type = 'Harvest'                -- legacy type
   AND t.status = 'Pending'
   AND b.task_type IN ('Harvest', 'Harvesting')
   AND b.end_date IS NOT NULL;

-- ── Step 2 — Collapse the per-day duplicates ──────────────────────────────
WITH ranked AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.blueprint_id, t.window_end_date
      ORDER BY
        CASE WHEN t.due_date = b.start_date THEN 0 ELSE 1 END,
        t.due_date ASC,
        t.created_at ASC
    ) AS rn
  FROM public.tasks t
  JOIN public.task_blueprints b ON b.id = t.blueprint_id
  WHERE t.window_end_date IS NOT NULL
    AND t.type = 'Harvest'              -- legacy type only — Wave-20.1 handled 'Harvesting'
    AND t.status = 'Pending'
)
UPDATE public.tasks t
   SET status = 'Skipped'
  FROM ranked r
 WHERE t.id = r.id
   AND r.rn > 1;
