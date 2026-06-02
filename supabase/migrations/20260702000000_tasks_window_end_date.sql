-- ─── Harvest window tasks (Plant Lens / Schedule Wave 20) ──────────────────
--
-- Harvest tasks behave differently from every other task: the user can't
-- harvest on a calendar date — they harvest when the fruit is ripe. Auto-
-- generated harvest blueprints used to fire a fresh ghost every day inside
-- the harvest window, so a single tomato plant could accumulate 60+ over-
-- due tasks if the user couldn't harvest on day one.
--
-- The window-task model fixes this:
--   1. One ghost per harvest window (not N daily ghosts).
--   2. The task carries the window's end date so the task engine can
--      keep it "active" through the window but only flag it overdue
--      AFTER the window closes.
--   3. The user can snooze in-window via "Not yet" or AI ripeness; the
--      `next_check_at` date hides it from Today until then.
--
-- Both columns are nullable — all existing tasks (and every non-harvest
-- task going forward) keep their current single-due-date semantics.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS window_end_date date,
  ADD COLUMN IF NOT EXISTS next_check_at   date;

COMMENT ON COLUMN public.tasks.window_end_date IS
  'For windowed tasks (today: Harvesting), the last day the window is open. The task is "active" from due_date through window_end_date and only goes overdue afterwards. NULL for non-window tasks.';

COMMENT ON COLUMN public.tasks.next_check_at IS
  'For window tasks the user has snoozed via "Not yet" or AI ripeness verdict. The task is hidden from Today / Calendar until this date. Reset on completion or window close.';

-- Partial index — most tasks won't have a window; query Today efficiently
-- by indexing only the few that do.
CREATE INDEX IF NOT EXISTS tasks_window_end_idx
  ON public.tasks (home_id, window_end_date)
  WHERE window_end_date IS NOT NULL;
