-- ─── Backfill: existing harvest tasks → window model ───────────────────────
--
-- Wave 20 introduced the window-task model for new harvest ghosts, but
-- existing pending Harvesting tasks that were materialised under the old
-- daily-cadence model still have `window_end_date = NULL` and so present
-- as normal overdue tasks. This one-time backfill applies the window
-- model retroactively and collapses the per-day pile-up.
--
--   Step 1 — Backfill window_end_date from the parent blueprint's end_date
--   for every pending Harvesting task whose blueprint has both a
--   `task_type = 'Harvesting'` and a non-null `end_date`.
--
--   Step 2 — Collapse duplicates. For each (blueprint_id, window_end_date)
--   group, keep one task (preferring the one whose due_date matches the
--   blueprint's start_date — i.e. the "true" window-start ghost) and mark
--   the rest as `status = 'Skipped'`. Skipped tasks are filtered out of
--   the engine's queries so they no longer count as overdue.
--
-- Idempotent — re-running the migration is a no-op because (a) Step 1
-- skips tasks that already have window_end_date set, and (b) Step 2 only
-- targets `status = 'Pending'` rows.

-- ── Step 1 — Backfill window_end_date ─────────────────────────────────────
UPDATE public.tasks t
   SET window_end_date = b.end_date
  FROM public.task_blueprints b
 WHERE t.blueprint_id = b.id
   AND t.window_end_date IS NULL
   AND t.type = 'Harvesting'
   AND t.status = 'Pending'
   AND b.task_type = 'Harvesting'
   AND b.end_date IS NOT NULL;

-- ── Step 2 — Collapse the per-day duplicates ──────────────────────────────
-- For each (blueprint_id, window_end_date) group, keep the task whose
-- due_date matches the blueprint's start_date when possible; otherwise the
-- earliest due_date; ties broken by earliest created_at. Every other
-- duplicate in the same group is marked Skipped.
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
    AND t.type = 'Harvesting'
    AND t.status = 'Pending'
)
UPDATE public.tasks t
   SET status = 'Skipped'
  FROM ranked r
 WHERE t.id = r.id
   AND r.rn > 1;
