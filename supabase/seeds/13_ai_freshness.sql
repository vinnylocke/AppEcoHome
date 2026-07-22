-- ============================================================
-- SEED 13 — AI Plant Catalogue freshness (Wave 5)
-- ============================================================
-- Requires: 00_bootstrap.sql, 02_plants_shed.sql
-- Covers test sections: AI-FRESH (Wave 5)
--
-- Sets up an unack'd "catalogue refreshed" scenario:
--
--   Plants:
--     Cherry Tomato (1000010, source='ai', home_id=NULL)
--       freshness_version=2, updated_care_fields=['sunlight','watering_min_days']
--       → the global catalogue row, "just refreshed" by the cron
--
--     Cherry Tomato (1000011, source='ai', home_id=<test home>)
--       forked_from_plant_id=1000010, overridden_fields=[]
--       → the user's shallow-fork copy in their shed
--
--   user_plant_ack:
--     (test user, plant_id=1000010, seen_freshness_version=1)
--       → user last viewed at version 1, global is now at 2 → chip shows
--
-- IMPORTANT: plant ids 1000010 / 1000011 sit outside the 1000001-1000006
-- range that scripts/seed-test-db.mjs substitutes per worker. They share
-- across all workers because the global AI catalogue is global by design.
-- ============================================================

-- ---- Global AI catalogue row (home_id NULL, source 'ai') ----

INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight,
  scientific_name,
  care_guide_data,
  freshness_version,
  updated_care_fields,
  last_care_generated_at,
  last_freshness_check_at
)
VALUES (
  1000010,
  'Cherry Tomato',
  'ai',
  NULL,
  false,
  'Frequent',
  'Medium',
  'Annual',
  'Compact tomato cultivar producing small sweet fruits.',
  '["full_sun"]'::jsonb,
  '["Solanum lycopersicum cerasiforme"]'::jsonb,
  '{"plantData":{"common_name":"Cherry Tomato","scientific_name":["Solanum lycopersicum cerasiforme"],"watering_min_days":2,"watering_max_days":4,"sunlight":["full_sun"],"plant_type":"Vegetable","cycle":"Annual","care_level":"Medium","description":"Compact tomato cultivar producing small sweet fruits."}}'::jsonb,
  2,
  '["sunlight","watering_min_days"]'::jsonb,
  (now() - interval '3 days'),
  (now() - interval '3 days')
)
ON CONFLICT (id) DO UPDATE SET
  freshness_version = EXCLUDED.freshness_version,
  updated_care_fields = EXCLUDED.updated_care_fields,
  last_care_generated_at = EXCLUDED.last_care_generated_at,
  last_freshness_check_at = EXCLUDED.last_freshness_check_at,
  care_guide_data = EXCLUDED.care_guide_data;

-- ---- Home-scoped shallow fork (the row that shows up in the user's Shed) ----

INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight,
  scientific_name,
  forked_from_plant_id,
  overridden_fields,
  freshness_version
)
VALUES (
  1000011,
  'Cherry Tomato',
  'ai',
  '00000000-0000-0000-0000-000000000002',
  false,
  'Frequent',
  'Medium',
  'Annual',
  'Compact tomato cultivar producing small sweet fruits.',
  '["full_sun"]'::jsonb,
  '["Solanum lycopersicum cerasiforme"]'::jsonb,
  1000010,
  '[]'::jsonb,
  1
)
ON CONFLICT (id) DO UPDATE SET
  forked_from_plant_id = EXCLUDED.forked_from_plant_id,
  overridden_fields = EXCLUDED.overridden_fields;

-- ---- User ack at the older version (so the chip fires) ----

INSERT INTO public.user_plant_ack (
  user_id, plant_id, seen_freshness_version, acked_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  1000010,
  1,
  (now() - interval '7 days')
)
ON CONFLICT (user_id, plant_id) DO UPDATE SET
  seen_freshness_version = EXCLUDED.seen_freshness_version,
  acked_at = EXCLUDED.acked_at;

-- v3 feedback polish (2026-07-22): the shallow fork (1000011) had no
-- inventory_items row — a zero-presence, un-hearted plant is now hidden from
-- the default Shed grid (the visibility law), which silently broke every test
-- keying off `favourite-plant-{1000011}` (e.g. FAV-005's Sprout tier-lock
-- check). Give it a real Unplanted instance so it keeps derived "active"
-- presence, matching the seeded Tomato/Lavender pattern.
INSERT INTO public.inventory_items (
  id, home_id, plant_id, plant_name, status, identifier
)
VALUES (
  '00000000-0000-0000-0004-000000000010',
  '00000000-0000-0000-0000-000000000002',
  1000011,
  'Cherry Tomato',
  'Unplanted',
  'CHT-001'
)
ON CONFLICT (id) DO UPDATE SET
  home_id    = EXCLUDED.home_id,
  plant_id   = EXCLUDED.plant_id,
  plant_name = EXCLUDED.plant_name,
  status     = EXCLUDED.status;

-- Same fix for the Wave 6 custom fork (1000013) — ai-plant-override.spec.ts
-- keys `plant-card-{LAVENDER_FORK_ID}` directly, which needs the card to render.
INSERT INTO public.inventory_items (
  id, home_id, plant_id, plant_name, status, identifier
)
VALUES (
  '00000000-0000-0000-0004-000000000011',
  '00000000-0000-0000-0000-000000000002',
  1000013,
  'Lavender',
  'Unplanted',
  'LAV-C01'
)
ON CONFLICT (id) DO UPDATE SET
  home_id    = EXCLUDED.home_id,
  plant_id   = EXCLUDED.plant_id,
  plant_name = EXCLUDED.plant_name,
  status     = EXCLUDED.status;

-- ---- Wave 6: a pre-customised home fork for the reset E2E ----
--
-- "Lavender (Custom)" — home-scoped AI plant that's already been edited.
-- overridden_fields = ["watering_min_days"] marks it as a custom fork, so the
-- Wave 6 UI should:
--   - Show the SourceChip in "AI · Custom" variant
--   - NOT show the Wave 5 freshness chip (deep fork → resolveGlobalId returns null)
--   - Show the "Reset to catalogue" button
--
-- Forks from global 1000012 (a second global, distinct from Cherry Tomato so
-- the two scenarios don't interfere). plant id 1000013 is substituted per
-- worker the same way 1000011 is.

INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight,
  scientific_name,
  care_guide_data,
  freshness_version,
  last_care_generated_at,
  last_freshness_check_at
)
VALUES (
  1000012,
  'Lavender',
  'ai',
  NULL,
  false,
  'Minimum',
  'Low',
  'Perennial',
  'Aromatic Mediterranean shrub with purple flowers.',
  '["full_sun"]'::jsonb,
  '["Lavandula angustifolia"]'::jsonb,
  '{"plantData":{"common_name":"Lavender","scientific_name":["Lavandula angustifolia"],"watering_min_days":7,"watering_max_days":14,"sunlight":["full_sun"],"plant_type":"Shrub","cycle":"Perennial","care_level":"Low","description":"Aromatic Mediterranean shrub with purple flowers."}}'::jsonb,
  1,
  (now() - interval '30 days'),
  (now() - interval '30 days')
)
ON CONFLICT (id) DO UPDATE SET
  freshness_version = EXCLUDED.freshness_version,
  care_guide_data   = EXCLUDED.care_guide_data;

-- Home-scoped CUSTOM fork — user has bumped watering_min_days from 7 to 3.
-- overridden_fields = ["watering_min_days"] marks the row as opted out.
INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description, sunlight,
  scientific_name,
  forked_from_plant_id,
  overridden_fields,
  freshness_version,
  watering_min_days,
  watering_max_days
)
VALUES (
  1000013,
  'Lavender',
  'ai',
  '00000000-0000-0000-0000-000000000002',
  false,
  'Minimum',
  'Low',
  'Perennial',
  'Aromatic Mediterranean shrub with purple flowers.',
  '["full_sun"]'::jsonb,
  '["Lavandula angustifolia"]'::jsonb,
  1000012,
  '["watering_min_days"]'::jsonb,
  1,
  3,
  14
)
ON CONFLICT (id) DO UPDATE SET
  forked_from_plant_id = EXCLUDED.forked_from_plant_id,
  overridden_fields    = EXCLUDED.overridden_fields,
  watering_min_days    = EXCLUDED.watering_min_days;
