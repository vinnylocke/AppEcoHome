-- ─── Recovery backfill — restore window_end_date after the postpone bug ───
--
-- buildGhostPayload (src/lib/taskMutations.ts) used to omit window_end_date
-- when creating the new task at the postponed date. Any harvest window
-- task a user postponed lost its window context: no green tint, no
-- in-window footer, no "appears on every day in window" behaviour. The
-- bug is fixed (Wave 20.8 buildGhostPayload patch), but tasks already
-- created during the broken window need a one-time top-up.
--
-- This migration is a verbatim re-run of the Wave-20.1 / Wave-20.7
-- backfill logic but with both type variants in one pass. Idempotent:
-- only touches rows where window_end_date IS NULL, so re-application
-- after future fresh postpones (which already preserve window_end_date
-- via the patched buildGhostPayload) is a no-op.
--
-- No status collapse this time — duplicates aren't expected at this
-- point, and we don't want to retroactively Skip something the user
-- explicitly postponed.

UPDATE public.tasks t
   SET window_end_date = b.end_date
  FROM public.task_blueprints b
 WHERE t.blueprint_id = b.id
   AND t.window_end_date IS NULL
   AND t.type IN ('Harvest', 'Harvesting')
   AND t.status = 'Pending'
   AND b.task_type IN ('Harvest', 'Harvesting')
   AND b.end_date IS NOT NULL;
