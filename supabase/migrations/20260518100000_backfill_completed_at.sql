-- Backfill completed_at for tasks completed before the field was actively written.
-- Uses due_date as a safe default (marks them as completed on time rather than uncounted).
UPDATE public.tasks
SET completed_at = due_date
WHERE status = 'Completed'
  AND completed_at IS NULL
  AND due_date IS NOT NULL;
