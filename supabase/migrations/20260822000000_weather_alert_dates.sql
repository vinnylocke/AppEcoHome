-- Weather alerts — represent the day(s) an alert spans, so the banner can group
-- by type ("Heatwave — Mon–Wed", "Frost — Fri & Sat") and the stale-out sweep can
-- key on the LAST affected day rather than the first.
-- See docs/plans/weather-alerts-grouped-forecast.md.

ALTER TABLE public.weather_alerts
  ADD COLUMN IF NOT EXISTS dates   jsonb,        -- e.g. ["2026-06-23","2026-06-24","2026-06-25"]
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;  -- last affected moment (for stale-out + range display)

-- Backfill existing rows so the new ends_at filter + grouped display work for them.
UPDATE public.weather_alerts
  SET ends_at = starts_at
  WHERE ends_at IS NULL;

UPDATE public.weather_alerts
  SET dates = jsonb_build_array(to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
  WHERE dates IS NULL;
