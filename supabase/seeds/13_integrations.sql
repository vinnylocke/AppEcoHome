-- ============================================================
-- SEED 13 — Integrations (soil sensor + water valve telemetry)
-- ============================================================
-- Fixed prefix: 00000000-0000-0000- (substituted per worker by seed-test-db.mjs)
-- Integration UUID : 00000000-0000-0000-0013-000000000001 (ecowitt)
-- Device UUIDs     : 00000000-0000-0000-0014-00000000000{n}
--   - Device 1: soil_sensor  → area "Raised Bed A" (0002-...001), fresh reading
--                (moisture 45% / 18.5°C / battery 82%) so the Home dashboard's
--                sensor chip shows "Soil: OK" / "45%".
--   - Device 2: water_valve  → area "South Border" (0002-...002), idle with a
--                turn_on valve_event 2 hours ago (10 min run) so the valve
--                chip shows last-run state, never "running".
--
-- credentials_encrypted is a placeholder — nothing in the E2E suite decrypts
-- it; the home-overview endpoint only reads devices/readings/events.
--
-- Safe to re-run: every statement upserts on its fixed UUID (ON CONFLICT DO
-- UPDATE); the reading and valve_event re-stamp their timestamps relative to
-- now() on each run so chips stay "fresh" on any run date.
-- ============================================================

INSERT INTO public.integrations (id, home_id, provider, credentials_encrypted, region, status)
VALUES (
  '00000000-0000-0000-0013-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'ecowitt',
  'seed-not-a-real-credential',
  'eu',
  'active'
)
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO public.devices (
  id, integration_id, home_id, location_id, area_id,
  external_device_id, name, device_type, provider, metadata, is_active, battery_percent
)
VALUES
  (
    '00000000-0000-0000-0014-000000000001',
    '00000000-0000-0000-0013-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'SEED-SOIL-1',
    'Raised Bed A Sensor',
    'soil_sensor',
    'ecowitt',
    '{"channel": 1}',
    true,
    82
  ),
  (
    '00000000-0000-0000-0014-000000000002',
    '00000000-0000-0000-0013-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000002',
    'SEED-VALVE-1',
    'South Border Valve',
    'water_valve',
    'ecowitt',
    '{"direct_device_id": "SEED-VALVE-1"}',
    true,
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  area_id     = EXCLUDED.area_id,
  is_active   = true,
  battery_percent = EXCLUDED.battery_percent;

-- Fresh soil reading (re-stamped to now() on every seed run so the chip
-- never goes stale-grey in tests).
INSERT INTO public.device_readings (id, device_id, home_id, recorded_at, data)
VALUES (
  '00000000-0000-0000-0015-000000000001',
  '00000000-0000-0000-0014-000000000001',
  '00000000-0000-0000-0000-000000000002',
  now(),
  '{"soil_moisture": 45.0, "soil_temp": 18.5, "soil_ec": 1.2, "battery_percent": 82}'
)
ON CONFLICT (id) DO UPDATE SET recorded_at = now();

-- Valve last ran 2 hours ago for 10 minutes → idle now (countdown long over).
INSERT INTO public.valve_events (id, device_id, home_id, event_type, triggered_by, duration_seconds, fired_at)
VALUES (
  '00000000-0000-0000-0016-000000000001',
  '00000000-0000-0000-0014-000000000002',
  '00000000-0000-0000-0000-000000000002',
  'turn_on',
  'scheduled',
  600,
  now() - interval '2 hours'
)
ON CONFLICT (id) DO UPDATE SET fired_at = now() - interval '2 hours';

-- Soil behaviour profile (2026-07-22) — a pre-computed soil_moisture_profiles
-- row for the soil sensor so DeviceDetailModal's "Soil behaviour" panel renders
-- deterministically in E2E (the compute-soil-profiles cron never runs locally).
INSERT INTO public.soil_moisture_profiles (
  device_id, home_id, area_id,
  drydown_rate_pct_per_day, retention_class, drydown_by_weather,
  watering_response, sample_segments, confidence,
  temp_behaviour, ec_behaviour, based_on_reading_at, computed_at
)
VALUES (
  '00000000-0000-0000-0014-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0002-000000000001',
  5.2, 'balanced', '[{"key": "mild", "ratePerDay": 5.2, "segments": 4}]',
  '{"rewetCount": 4, "avgRewetJump": 18.5, "avgSegmentDurationDays": 3.1}', 4, 0.7,
  '{"dayMaxC": 24.5, "nightMinC": 12.0, "diurnalSwingC": 12.5, "sampleDays": 7}',
  '{"mean": 620, "cv": 0.04, "stability": "stable", "trend": "flat", "sampleDays": 7, "ecSource": "calibrated_us_cm"}',
  now(), now()
)
ON CONFLICT (device_id) DO UPDATE SET
  temp_behaviour = EXCLUDED.temp_behaviour,
  ec_behaviour   = EXCLUDED.ec_behaviour,
  computed_at    = now();
