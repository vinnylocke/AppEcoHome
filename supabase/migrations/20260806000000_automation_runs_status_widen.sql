-- Widen automation_runs.status CHECK to cover every status the engine writes
-- (2026-06-19).
--
-- Bug: the original constraint (20260530000000) only allowed
--   pending / success / partial / failed / skipped_weather / skipped_no_tasks
-- but the unified engine writes `skipped_rate_limited` (run-limit gate) and the
-- weather-defer path writes `deferred_weather`. Those INSERTs silently violated
-- the constraint (the engine didn't check the insert error), so rate-limited /
-- deferred runs were NEVER recorded — making a correctly rate-limited automation
-- look broken in the run history. Cover all statuses referenced across the
-- automation code + data model so this can't bite again.

ALTER TABLE public.automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;

ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_status_check CHECK (
  status IN (
    'pending', 'success', 'partial', 'failed', 'ran', 'retried',
    'skipped_weather', 'skipped_no_tasks', 'skipped_rain',
    'skipped_rate_limited', 'deferred_weather'
  )
);
