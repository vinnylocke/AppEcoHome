-- ─── Backfill: existing pruning tasks → window model ──────────────────────
--
-- Pruning became a seasonal WINDOW task (2026-07, OS 35.0046), but pre-existing
-- pruning tasks — materialised as daily rows by the old cron and then completed
-- by the user — still have `window_end_date = NULL`. Without it:
--   • the dashboard "remaining today" query (due today OR window covers today)
--     never fetches the completed pruning row, so it can't suppress the new
--     window ghost → the ghost counts as a pending task (wrong "X of Y").
--   • the row isn't recognised as in-window, so it drops out of view.
--
-- Set `window_end_date` from the parent blueprint's `end_date` for every
-- non-Skipped pruning task (Pending or Completed) of a WINDOWED pruning
-- blueprint (`task_type = 'Pruning' AND end_date IS NOT NULL`) where it's
-- currently NULL. Mirrors the Wave-20 harvest backfill (Step 1).
--
-- Idempotent — re-running is a no-op (only touches NULL window_end_date rows).

UPDATE public.tasks t
   SET window_end_date = b.end_date
  FROM public.task_blueprints b
 WHERE t.blueprint_id = b.id
   AND t.window_end_date IS NULL
   AND t.type = 'Pruning'
   AND t.status <> 'Skipped'
   AND b.task_type = 'Pruning'
   AND b.end_date IS NOT NULL;
