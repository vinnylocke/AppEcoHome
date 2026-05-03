-- ============================================================
-- SEED 02 — Plants & Inventory Items (The Shed)
-- ============================================================
-- Requires: 00_bootstrap.sql, 01_locations_areas.sql
-- Covers test sections: SHED, LOC (planted plants on areas)
--
-- Plants (in plants table):
--   Tomato      — manual, active
--   Basil       — manual, active
--   Rose        — manual, active
--   Boston Fern — manual, active
--   Mint        — manual, ARCHIVED
--   Lavender    — api source, active
--
-- Inventory items (plant instances):
--   Tomato    — Unplanted (in shed)
--   Basil     — Planted → Raised Bed A
--   Rose      — Planted → South Border
--   Fern      — Planted → Kitchen Windowsill
--   Mint      — Archived
--   Lavender  — Unplanted (in shed), api source
-- ============================================================

-- ---- Plants ----

INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight
)
VALUES
  (
    1000001,
    'Tomato',
    'manual',
    '00000000-0000-0000-0000-000000000002',
    false,
    'Average',
    'Medium',
    'Annual',
    'A versatile fruiting plant suitable for raised beds and containers.',
    NULL   -- no sunlight data — used for LGT-008 no-data card test
  ),
  (
    1000002,
    'Basil',
    'manual',
    '00000000-0000-0000-0000-000000000002',
    false,
    'Frequent',
    'Low',
    'Annual',
    'A fragrant culinary herb that thrives in warm, sunny spots.',
    '["Full sun", "Partial shade"]'::jsonb
  ),
  (
    1000003,
    'Rose',
    'manual',
    '00000000-0000-0000-0000-000000000002',
    false,
    'Average',
    'Medium',
    'Perennial',
    'Classic flowering shrub requiring seasonal pruning.',
    '["Full sun"]'::jsonb
  ),
  (
    1000004,
    'Boston Fern',
    'manual',
    '00000000-0000-0000-0000-000000000002',
    false,
    'Frequent',
    'Low',
    'Perennial',
    'An indoor fern that prefers indirect light and high humidity.',
    '["Partial shade", "Shade"]'::jsonb
  ),
  (
    1000005,
    'Mint',
    'manual',
    '00000000-0000-0000-0000-000000000002',
    true,   -- archived
    'Average',
    'Low',
    'Perennial',
    'A vigorous spreading herb — keep contained.',
    '["Full sun", "Partial shade"]'::jsonb
  ),
  (
    1000006,
    'Lavender',
    'api',
    '00000000-0000-0000-0000-000000000002',
    false,
    'Minimum',
    'Low',
    'Perennial',
    'Drought-tolerant fragrant shrub ideal for borders.',
    '["Full sun"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  common_name  = EXCLUDED.common_name,
  home_id      = EXCLUDED.home_id,
  is_archived  = EXCLUDED.is_archived,
  watering     = EXCLUDED.watering,
  care_level   = EXCLUDED.care_level,
  sunlight     = EXCLUDED.sunlight;

-- ---- Inventory Items ----

INSERT INTO public.inventory_items (
  id, home_id, plant_id, plant_name, status,
  location_id, location_name, area_id, area_name, identifier
)
VALUES
  -- Tomato — Unplanted (in shed)
  (
    '00000000-0000-0000-0004-000000000001',
    '00000000-0000-0000-0000-000000000002',
    1000001,
    'Tomato',
    'Unplanted',
    NULL, NULL, NULL, NULL,
    'TOM-001'
  ),
  -- Basil — Planted in Raised Bed A
  (
    '00000000-0000-0000-0004-000000000002',
    '00000000-0000-0000-0000-000000000002',
    1000002,
    'Basil',
    'Planted',
    '00000000-0000-0000-0001-000000000001',
    'Outside Garden',
    '00000000-0000-0000-0002-000000000001',
    'Raised Bed A',
    'BAS-001'
  ),
  -- Rose — Planted in South Border
  (
    '00000000-0000-0000-0004-000000000003',
    '00000000-0000-0000-0000-000000000002',
    1000003,
    'Rose',
    'Planted',
    '00000000-0000-0000-0001-000000000001',
    'Outside Garden',
    '00000000-0000-0000-0002-000000000002',
    'South Border',
    'ROS-001'
  ),
  -- Boston Fern — Planted on Kitchen Windowsill
  (
    '00000000-0000-0000-0004-000000000004',
    '00000000-0000-0000-0000-000000000002',
    1000004,
    'Boston Fern',
    'Planted',
    '00000000-0000-0000-0001-000000000002',
    'Indoor Space',
    '00000000-0000-0000-0002-000000000004',
    'Kitchen Windowsill',
    'FRN-001'
  ),
  -- Mint — Archived
  (
    '00000000-0000-0000-0004-000000000005',
    '00000000-0000-0000-0000-000000000002',
    1000005,
    'Mint',
    'Archived',
    NULL, NULL, NULL, NULL,
    'MIN-001'
  ),
  -- Lavender — Unplanted (api source plant)
  (
    '00000000-0000-0000-0004-000000000006',
    '00000000-0000-0000-0000-000000000002',
    1000006,
    'Lavender',
    'Unplanted',
    NULL, NULL, NULL, NULL,
    'LAV-001'
  )
ON CONFLICT (id) DO UPDATE SET
  home_id       = EXCLUDED.home_id,
  plant_id      = EXCLUDED.plant_id,
  plant_name    = EXCLUDED.plant_name,
  status        = EXCLUDED.status,
  location_id   = EXCLUDED.location_id,
  location_name = EXCLUDED.location_name,
  area_id       = EXCLUDED.area_id,
  area_name     = EXCLUDED.area_name;
