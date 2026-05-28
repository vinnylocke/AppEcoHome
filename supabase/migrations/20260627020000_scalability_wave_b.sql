-- Scalability Wave B — Log table retention
--
-- Findings addressed (per docs/scalability-audit.md):
--   2.1  user_events:       30-day retention
--   2.2  ai_usage_log:      90-day retention
--   2.3  notifications:     60-day retention (read entries only)
--   2.4  chat_messages:     365-day retention
--   2.5  rate_limit_log,
--        ip_rate_limit_log: 7-day retention
--   2.6  device_readings:   30-day retention (raw rows)
--   2.7  automation_runs:   180-day retention
--   2.8  plant_library_runs / batches: 90 / 30 days
--
-- Strategy: install one daily prune cron `prune-app-logs-daily` at 04:50 UTC
-- (5 min after the existing prune-system-logs-daily that handles
-- net._http_response + cron.job_run_details).
--
-- First-run note: backlog catch-up may take minutes if tables are large.
-- Subsequent runs are trivial (daily inflow bounded × retention window).

SELECT cron.schedule(
  'prune-app-logs-daily',
  '50 4 * * *',
  $$
  -- High-volume event stream — 30-day retention is more than the pattern
  -- engine's 7-day scan window needs.
  DELETE FROM public.user_events
    WHERE created_at < now() - interval '30 days';

  -- AI usage rows. 90 days is plenty for billing audits + the Audit Page.
  DELETE FROM public.ai_usage_log
    WHERE created_at < now() - interval '90 days';

  -- Bell-icon notifications. Only prune already-read entries.
  DELETE FROM public.notifications
    WHERE created_at < now() - interval '60 days'
      AND is_read = true;

  -- Chat history. 1 year window; tighten later if needed.
  DELETE FROM public.chat_messages
    WHERE created_at < now() - interval '365 days';

  -- Rate-limiter windows are minutes; anything older than a week is dead data.
  DELETE FROM public.rate_limit_log
    WHERE window_start < now() - interval '7 days';

  DELETE FROM public.ip_rate_limit_log
    WHERE window_start < now() - interval '7 days';

  -- IoT sensor readings. 30 days raw; hourly rollup (future) keeps long-term.
  DELETE FROM public.device_readings
    WHERE recorded_at < now() - interval '30 days';

  -- Automation fire history. 180 days covers any seasonal debugging window.
  DELETE FROM public.automation_runs
    WHERE triggered_at < now() - interval '180 days';

  -- Plant Library admin tooling.
  DELETE FROM public.plant_library_runs
    WHERE started_at < now() - interval '90 days';

  DELETE FROM public.plant_library_batches
    WHERE submitted_at < now() - interval '30 days'
      AND status IN ('processed', 'failed', 'cancelled');
  $$
);
