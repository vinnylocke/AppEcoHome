-- ─── PERFORMANCE INDEX FOR DASHBOARD STATS ───────────────────────────────────
-- Supports the home-dashboard-stats edge function's weekly task aggregation query.
CREATE INDEX IF NOT EXISTS idx_tasks_home_week
  ON tasks(home_id, due_date, status);
