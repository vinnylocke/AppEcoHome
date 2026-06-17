-- Hybrid weather + sensor watering automations (2026-06-17)
--
-- Adds a per-automation `weather_mode` selector (off / skip / defer) plus the
-- config + single-pending deferral state that powers "defer-and-recheck"
-- watering. The moisture sensor stays the source of truth: weather can only
-- DEFER a watering, never silently cancel it. See
-- docs/plans/hybrid-weather-sensor-automations.md.
--
-- NOTE: `automations` is a pre-existing (grandfathered) table — RLS + Data-API
-- grants already exist, so column additions need no new grants.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS weather_mode              text    NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS weather_min_probability   integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS weather_defer_window_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS critical_threshold_value  numeric,
  ADD COLUMN IF NOT EXISTS max_defers                integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS defer_skip_in_heat        boolean NOT NULL DEFAULT true,
  -- Single pending deferral per automation (no per-rain-event accumulation).
  ADD COLUMN IF NOT EXISTS defer_until               timestamptz,
  ADD COLUMN IF NOT EXISTS defer_count               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defer_started_at          timestamptz;

-- weather_mode is a closed set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automations_weather_mode_check'
  ) THEN
    ALTER TABLE public.automations
      ADD CONSTRAINT automations_weather_mode_check
      CHECK (weather_mode IN ('off', 'skip', 'defer'));
  END IF;
END $$;

-- Back-fill: existing rain-skip automations become weather_mode = 'skip' so
-- behaviour is unchanged after the upgrade. `skip_if_rained` is kept for
-- compatibility; the runners now read `weather_mode`.
UPDATE public.automations
SET weather_mode = 'skip'
WHERE skip_if_rained = true AND weather_mode = 'off';

-- Index the pending-deferral rows the 5-min evaluator scans each tick.
CREATE INDEX IF NOT EXISTS idx_automations_defer_until
  ON public.automations (defer_until)
  WHERE defer_until IS NOT NULL;
