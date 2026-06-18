-- Unified condition automations — Phase 3 cleanup (2026-06-18)
--
-- Drop the legacy trigger-definition + weather-modifier columns now that every
-- automation runs on `trigger_logic` (backfill confirmed: 0 rows with NULL
-- trigger_logic in production; the engine no longer reads these columns and the
-- legacy builders were removed). Indexes/constraints on these columns
-- (automations_weather_mode_check, idx_automations_defer_until) drop with them.
--
-- Kept: trigger_logic, condition_was_true, last_fired_at, sensor_cooldown_minutes
-- (engine), area_id (sensor fallback + Area Coach), duration_seconds /
-- retry_on_failure / fire_valves_sequentially (manual valve firing), tier,
-- trigger_kind (now 'condition').

ALTER TABLE public.automations
  DROP COLUMN IF EXISTS scheduled_time,
  DROP COLUMN IF EXISTS sensor_metric,
  DROP COLUMN IF EXISTS sensor_comparator,
  DROP COLUMN IF EXISTS sensor_threshold_value,
  DROP COLUMN IF EXISTS sensor_hysteresis,
  DROP COLUMN IF EXISTS sensor_agg_mode,
  DROP COLUMN IF EXISTS sensor_last_fired_at,
  DROP COLUMN IF EXISTS skip_if_rained,
  DROP COLUMN IF EXISTS rain_threshold_mm,
  DROP COLUMN IF EXISTS trigger_if_hot,
  DROP COLUMN IF EXISTS heat_threshold_c,
  DROP COLUMN IF EXISTS weather_mode,
  DROP COLUMN IF EXISTS weather_min_probability,
  DROP COLUMN IF EXISTS weather_defer_window_hours,
  DROP COLUMN IF EXISTS critical_threshold_value,
  DROP COLUMN IF EXISTS max_defers,
  DROP COLUMN IF EXISTS defer_skip_in_heat,
  DROP COLUMN IF EXISTS defer_until,
  DROP COLUMN IF EXISTS defer_count,
  DROP COLUMN IF EXISTS defer_started_at,
  DROP COLUMN IF EXISTS last_run_date;
