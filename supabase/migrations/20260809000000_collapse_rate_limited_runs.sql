-- One-time cleanup for the rate-limited-skip flood.
-- See docs/plans/automation-run-history-flood-fix.md.
--
-- Before the collapse fix, the event-driven engine + repeat-while-true firing
-- inserted a `skipped_rate_limited` automation_runs row on EVERY tick once an
-- automation hit its run-limit. Those rows buried the real runs (the history
-- UI shows only the last 10). Going forward the engine collapses consecutive
-- skips into a single rolling row; this clears the existing backlog so users
-- can see their real runs again immediately.
--
-- Safety:
--   * Only `skipped_rate_limited` rows are deleted.
--   * The most recent such row per automation is KEPT, so the rate-limit stays
--     visible in the history.
--   * Real runs (success / partial / failed / skipped_weather /
--     skipped_no_tasks / deferred_weather / …) are never touched.

DELETE FROM public.automation_runs
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY automation_id
             ORDER BY triggered_at DESC, id DESC
           ) AS rn
    FROM public.automation_runs
    WHERE status = 'skipped_rate_limited'
  ) ranked
  WHERE ranked.rn > 1
);
