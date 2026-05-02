-- ============================================================
-- SEED 01 — Locations & Areas
-- ============================================================
-- Requires: 00_bootstrap.sql
-- Covers test sections: MGMT, LOC, SHED (assignment), TASK
--
-- Outside Garden (LOC_GARDEN_ID)
--   ├── Raised Bed A     (AREA_RAISED_BED_ID)   — soil, pH 6.5, planted
--   ├── South Border     (AREA_BORDER_ID)        — soil, planted
--   └── Greenhouse       (AREA_GREENHOUSE_ID)    — controlled, empty
--
-- Indoor Space (LOC_INDOOR_ID)
--   ├── Kitchen Windowsill (AREA_WINDOWSILL_ID)  — planted
--   └── Living Room        (AREA_LIVING_ROOM_ID) — empty
-- ============================================================

-- ---- Cleanup: remove leaked E2E test locations from previous runs ----
-- (keeps only the two seeded locations; E2E tests create locations with names
-- starting 'E2E' and must clean up after themselves, but sometimes don't)
DELETE FROM public.locations
WHERE home_id = '00000000-0000-0000-0000-000000000002'
  AND id NOT IN (
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0001-000000000002'
  );

-- ---- Locations ----

INSERT INTO public.locations (id, home_id, name, placement, is_outside)
VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Outside Garden',
    'Outside',
    true
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Indoor Space',
    'Inside',
    false
  )
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  placement  = EXCLUDED.placement,
  is_outside = EXCLUDED.is_outside;

-- ---- Areas ----

INSERT INTO public.areas (
  id, location_id, name,
  growing_medium, medium_ph, light_intensity_lux
)
VALUES
  -- Outside Garden areas
  (
    '00000000-0000-0000-0002-000000000001',
    '00000000-0000-0000-0001-000000000001',
    'Raised Bed A',
    'Loam',
    6.5,
    40000
  ),
  (
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0001-000000000001',
    'South Border',
    'Clay',
    6.8,
    35000
  ),
  (
    '00000000-0000-0000-0002-000000000003',
    '00000000-0000-0000-0001-000000000001',
    'Greenhouse',
    'Peat',
    5.8,
    20000
  ),
  -- Indoor Space areas
  (
    '00000000-0000-0000-0002-000000000004',
    '00000000-0000-0000-0001-000000000002',
    'Kitchen Windowsill',
    'Potting Mix',
    6.0,
    3000
  ),
  (
    '00000000-0000-0000-0002-000000000005',
    '00000000-0000-0000-0001-000000000002',
    'Living Room',
    'Potting Mix',
    6.2,
    1500
  )
ON CONFLICT (id) DO NOTHING;
