-- ============================================================
-- SEED 04 — Weather Snapshot & Alerts
-- ============================================================
-- Requires: 00_bootstrap.sql, 01_locations_areas.sql
-- Covers test sections: DASH (weather widget, GI panel, alerts)
--
-- Data is stored in Open-Meteo columnar format (parallel arrays),
-- matching what WeatherForecast.tsx and evaluateRules() expect.
--
-- 8-day window (Day -1 through Day +6), daily array indices:
--   [0] Day -1 : WMO  0 — Clear sky                      — no rain
--   [1] Day  0 : WMO 61 — Rain 8mm + heat 36°C + wind 65 — all 3 "today" rules fire
--                          rainTriggered=true (TASK-020), heatwave (DASH-018), high winds (DASH-019)
--   [2] Day +1 : WMO 71 — Snow, frost                    — minTemp 0°C (DASH-007, DASH-017)
--   [3] Day +2 : WMO 45 — Fog                            — Cloud icon (DASH-009)
--   [4] Day +3 : WMO 95 — Thunderstorm                   — CloudLightning icon (DASH-008)
--   [5] Day +4 : WMO  2 — Partly cloudy                  — mild recovery
--   [6] Day +5 : WMO  1 — Mainly clear                   — Sun icon (DASH-005)
--   [7] Day +6 : WMO  0 — Clear sky                      — fine end
--
-- Hourly: 48 entries (today + tomorrow) for frost detection
--   Hours  0-23 (today):    temp=14°C, code=61 (rain)
--   Hours 24-47 (tomorrow): temp=1°C,  code=71 (frost risk)
--
-- WMO icon mapping (via wmoIcon() in WeatherForecast.tsx):
--   WMO  0/1  → .lucide-sun          (DASH-005)
--   WMO 61    → .lucide-cloud-rain   (DASH-006)
--   WMO 71    → .lucide-cloud-snow   (DASH-007)
--   WMO 95    → .lucide-cloud-lightning (DASH-008)
--   WMO 45    → .lucide-cloud        (DASH-009)
--
-- Alerts seeded for Outside Garden location (LOC_GARDEN_ID):
--   rain, heat, frost, wind
-- ============================================================

-- ---- Weather Snapshot ----
-- Uses a CTE with generate_series to build parallel-array (columnar) data.

WITH gen AS (
  SELECT
    -- Daily: 8 dates — Day -1 through Day +6
    array_to_json(ARRAY(
      SELECT to_char(CURRENT_DATE - 1 + d, 'YYYY-MM-DD')
      FROM generate_series(0, 7) AS d
    ))::jsonb AS daily_times,

    -- Hourly: 48 timestamps — today 00:00 through tomorrow 23:00
    array_to_json(ARRAY(
      SELECT to_char(CURRENT_DATE::timestamp + (h * INTERVAL '1 hour'), 'YYYY-MM-DD"T"HH24:MI')
      FROM generate_series(0, 47) AS h
    ))::jsonb AS hourly_times,

    -- Hourly temps: 14°C today, 1°C tomorrow (frost triggers at <=2°C)
    array_to_json(ARRAY(
      SELECT CASE WHEN h < 24 THEN 14.0 ELSE 1.0 END
      FROM generate_series(0, 47) AS h
    ))::jsonb AS hourly_temps,

    -- Hourly weather codes: 61 (rain) today, 71 (snow) tomorrow
    array_to_json(ARRAY(
      SELECT CASE WHEN h < 24 THEN 61 ELSE 71 END
      FROM generate_series(0, 47) AS h
    ))::jsonb AS hourly_codes,

    -- Hourly wind (65 km/h today — matches daily wind for Day 0)
    array_to_json(ARRAY(SELECT 65.0 FROM generate_series(1, 48)))::jsonb AS hourly_wind,

    -- Hourly precipitation probability (uniform 75%)
    array_to_json(ARRAY(SELECT 75 FROM generate_series(1, 48)))::jsonb AS hourly_precip_prob,

    -- Hourly humidity (uniform 80%)
    array_to_json(ARRAY(SELECT 80 FROM generate_series(1, 48)))::jsonb AS hourly_humidity
)
INSERT INTO public.weather_snapshots (id, home_id, data, updated_at)
SELECT
  '00000000-0000-0000-000a-000000000001',
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object(
    'fetchedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'timezone',  'Europe/London',

    'daily', jsonb_build_object(
      'time',                          gen.daily_times,
      -- Parallel value arrays aligned with daily_times
      'weathercode',                   '[0, 61, 71, 45, 95, 2, 1, 0]'::jsonb,
      'temperature_2m_max',            '[18, 36, 4, 12, 16, 20, 22, 22]'::jsonb,
      'temperature_2m_min',            '[10, 22, 0,  5, 10, 12, 14, 14]'::jsonb,
      'precipitation_sum',             '[0,  8, 3,  0,  5,  0,  0,  0]'::jsonb,
      'precipitation_probability_max', '[5, 75, 80, 10, 90, 10,  5,  5]'::jsonb,
      'windspeed_10m_max',             '[12, 65, 22, 45, 35, 18, 15, 12]'::jsonb
    ),

    'hourly', jsonb_build_object(
      'time',                      gen.hourly_times,
      'temperature_2m',            gen.hourly_temps,
      'weather_code',              gen.hourly_codes,
      'wind_speed_10m',            gen.hourly_wind,
      'precipitation_probability', gen.hourly_precip_prob,
      'relative_humidity_2m',      gen.hourly_humidity
    )
  ),
  now()
FROM gen
ON CONFLICT (home_id) DO UPDATE
  SET data = EXCLUDED.data, updated_at = now();

-- ---- Weather Alerts ----
-- unique constraint is on (location_id, type) so DO NOTHING is safe.

INSERT INTO public.weather_alerts (
  id, location_id, type, message, severity, starts_at, is_active
)
VALUES
  -- Rain alert — matches today's rain (Day 0 = precipMm 8mm)
  (
    '00000000-0000-0000-000b-000000000001',
    '00000000-0000-0000-0001-000000000001',
    'rain',
    'Rain today (8mm) — outdoor watering tasks are auto-completed.',
    'info',
    CURRENT_DATE,
    true
  ),
  -- Heat alert — kept for alert-panel tests
  (
    '00000000-0000-0000-000b-000000000002',
    '00000000-0000-0000-0001-000000000001',
    'heat',
    'Warm and rainy today — check for fungal risk on dense plantings.',
    'warning',
    CURRENT_DATE,
    true
  ),
  -- Frost alert — Day +1 minTemp 0°C
  (
    '00000000-0000-0000-000b-000000000003',
    '00000000-0000-0000-0001-000000000001',
    'frost',
    'Frost risk tomorrow — cover tender plants and bring pots inside.',
    'warning',
    CURRENT_DATE + INTERVAL '1 day',
    true
  ),
  -- Wind alert — Day +2 windKph 65
  (
    '00000000-0000-0000-000b-000000000004',
    '00000000-0000-0000-0001-000000000001',
    'wind',
    'High winds forecast (65 kph) — stake tall plants and secure structures.',
    'warning',
    CURRENT_DATE + INTERVAL '2 days',
    true
  )
ON CONFLICT (location_id, type) DO UPDATE
  SET
    message    = EXCLUDED.message,
    severity   = EXCLUDED.severity,
    starts_at  = EXCLUDED.starts_at,
    is_active  = true;
