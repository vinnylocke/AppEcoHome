-- Weather-aware automations: add a heat-trigger toggle alongside the
-- existing rain-skip toggle. The two are surfaced together in the UI
-- under a parent "Weather-aware" toggle, but stored as separate
-- columns so each can be tuned (or off) independently.
--
-- Defaults to off so existing automations behave identically.

ALTER TABLE automations
  ADD COLUMN trigger_if_hot   boolean NOT NULL DEFAULT false,
  ADD COLUMN heat_threshold_c numeric NOT NULL DEFAULT 28;

COMMENT ON COLUMN automations.trigger_if_hot IS
  'When true, run-automations fires this automation at its scheduled_time on days where the forecast max temp is >= heat_threshold_c, even when no controlling task is due that day. Rain-skip still wins if both conditions are met.';

COMMENT ON COLUMN automations.heat_threshold_c IS
  'Forecast max temperature (°C) above which trigger_if_hot fires. Compared against weather_snapshots.data->>daily.temperature_2m_max[today_idx].';
