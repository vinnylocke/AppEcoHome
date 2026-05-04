-- ============================================================
-- SEED 10 — Area Lux Readings
-- ============================================================
-- Requires: 00_bootstrap.sql, 01_locations_areas.sql
-- Covers test section: LUX
--
-- 3 sensor readings for Raised Bed A (area 0002-000000000001)
-- spread across times of day to give AI richer light context.
-- IDs use prefix 000f.
-- ============================================================

INSERT INTO public.area_lux_readings (id, home_id, area_id, lux_value, recorded_at, source)
VALUES
  (
    '00000000-0000-0000-000f-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0002-000000000001',
    8000,
    (CURRENT_DATE - INTERVAL '1 day') + INTERVAL '9 hours',
    'sensor'
  ),
  (
    '00000000-0000-0000-000f-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0002-000000000001',
    35000,
    (CURRENT_DATE - INTERVAL '1 day') + INTERVAL '13 hours',
    'sensor'
  ),
  (
    '00000000-0000-0000-000f-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0002-000000000001',
    15000,
    (CURRENT_DATE - INTERVAL '1 day') + INTERVAL '17 hours',
    'sensor'
  )
ON CONFLICT (id) DO NOTHING;
