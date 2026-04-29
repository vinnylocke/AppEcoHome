-- Stores why a task was auto-completed by the system (e.g. weather rule)
-- Displayed on the task card so users understand what happened.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS auto_completed_reason text;
