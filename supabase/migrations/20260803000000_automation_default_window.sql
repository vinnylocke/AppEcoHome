-- Home-level default "active hours" window for automations (2026-06-19).
--
-- An automation whose condition tree has NO time/date condition of its own runs
-- 24/7 today, which can mean surprise overnight watering. These columns give the
-- home a default window (pre-populated 08:00–20:00) that `evaluate-automations`
-- applies ONLY to automations without their own time/date leaf. Editable from
-- Integrations → Automations; set `automation_window_enabled = false` for 24/7.
--
-- `homes` predates the 2026-10-30 Data-API grant cutoff, so it's grandfathered
-- in — no explicit GRANTs required for these new columns.

ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS automation_window_start   time        NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS automation_window_end     time        NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS automation_window_enabled boolean     NOT NULL DEFAULT true;

COMMENT ON COLUMN public.homes.automation_window_start IS
  'Default automation active-window start (home local time). Applies only to automations with no time/date condition of their own.';
COMMENT ON COLUMN public.homes.automation_window_end IS
  'Default automation active-window end (home local time). end <= start wraps past midnight.';
COMMENT ON COLUMN public.homes.automation_window_enabled IS
  'When false, automations without their own time condition run 24/7 (no default window).';
