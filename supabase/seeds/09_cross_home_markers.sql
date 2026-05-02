-- ============================================================
-- SEED 09 — Cross-Home Isolation Markers (W2 only, hardcoded)
-- ============================================================
-- Purpose: Seeds distinctly-named rows in Worker 2's home that must
--          NOT be visible to any other worker account. E2E isolation
--          tests verify that W1, W3, W4 cannot see these rows.
--
-- These IDs use the 00000002-0000-0000- prefix (W2's UUID namespace)
-- hardcoded — the seed script's substitution does NOT touch them because
-- substitution only replaces `00000000-0000-0000-` (the base prefix).
--
-- Idempotent: safe to run multiple times.
-- Requires: 00_bootstrap.sql applied for W2 (test2@rhozly.com).
-- ============================================================

-- ---- Cross-Home Plant (in plants table) ----
INSERT INTO public.plants (
  id, common_name, source, home_id, is_archived,
  watering, care_level, cycle, description
)
VALUES (
  9900001,
  'Cross-Home Marker Plant',
  'manual',
  '00000002-0000-0000-0000-000000000002',
  false,
  'Average',
  'Low',
  'Annual',
  'Isolation test marker — must only be visible to W2.'
)
ON CONFLICT (id) DO UPDATE SET
  common_name = EXCLUDED.common_name,
  home_id     = EXCLUDED.home_id;

-- ---- Cross-Home Inventory Item ----
INSERT INTO public.inventory_items (
  id, home_id, plant_id, plant_name, status,
  location_id, location_name, area_id, area_name, identifier
)
VALUES (
  '00000002-0000-0000-0003-999000000001',
  '00000002-0000-0000-0000-000000000002',
  9900001,
  'Cross-Home Marker Plant',
  'Unplanted',
  NULL, NULL, NULL, NULL,
  'XHM-001'
)
ON CONFLICT (id) DO UPDATE SET
  home_id    = EXCLUDED.home_id,
  plant_name = EXCLUDED.plant_name,
  status     = EXCLUDED.status;

-- ---- Cross-Home Location ----
INSERT INTO public.locations (id, home_id, name, placement, is_outside)
VALUES (
  '00000002-0000-0000-0001-999000000001',
  '00000002-0000-0000-0000-000000000002',
  'Cross-Home Marker Location',
  'Outside',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  placement = EXCLUDED.placement;

-- ---- Cross-Home Ailment ----
INSERT INTO public.ailments (
  id, home_id, name, scientific_name, type, source,
  description, symptoms, affected_plants,
  prevention_steps, remedy_steps, is_archived
)
VALUES (
  '00000002-0000-0000-0007-999000000001',
  '00000002-0000-0000-0000-000000000002',
  'Cross-Home Marker Ailment',
  'Testius isolatus',
  'pest',
  'manual',
  'Isolation test marker — must only be visible to W2.',
  '[]'::jsonb,
  ARRAY['Test Plant'],
  '[]'::jsonb,
  '[]'::jsonb,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name    = EXCLUDED.name,
  home_id = EXCLUDED.home_id;

-- ---- Cross-Home Plan ----
INSERT INTO public.plans (
  id, home_id, name, description, status, ai_blueprint, staging_state
)
VALUES (
  '00000002-0000-0000-0008-999000000001',
  '00000002-0000-0000-0000-000000000002',
  'Cross-Home Marker Plan',
  'Isolation test marker — must only be visible to W2.',
  'In Progress',
  '{}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name    = EXCLUDED.name,
  home_id = EXCLUDED.home_id;

-- ---- Cross-Home Task Blueprint ----
INSERT INTO public.task_blueprints (
  id, home_id, title, task_type, frequency_days,
  start_date, end_date, is_recurring, priority,
  location_id, area_id, blueprint_type
)
VALUES (
  '00000002-0000-0000-0005-999000000001',
  '00000002-0000-0000-0000-000000000002',
  'Cross-Home Marker Blueprint',
  'Watering',
  7,
  CURRENT_DATE,
  NULL,
  true,
  'Low',
  '00000002-0000-0000-0001-000000000001',
  NULL,
  'plant'
)
ON CONFLICT (id) DO UPDATE SET
  title   = EXCLUDED.title,
  home_id = EXCLUDED.home_id;

-- ---- Cross-Home Task ----
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000002-0000-0000-0006-999000000001',
  '00000002-0000-0000-0000-000000000002',
  'Cross-Home Marker Task',
  'Watering',
  'Pending',
  CURRENT_DATE,
  '00000002-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET
  title   = EXCLUDED.title,
  home_id = EXCLUDED.home_id;
