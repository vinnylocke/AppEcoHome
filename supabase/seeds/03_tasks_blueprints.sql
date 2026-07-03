-- ============================================================
-- SEED 03 — Task Blueprints & Physical Tasks
-- ============================================================
-- Requires: 00_bootstrap.sql, 01_locations_areas.sql, 02_plants_shed.sql
-- Covers test sections: SCH, TASK, CAL, DASH (task list)
--
-- Blueprints (recurring automations — ghost tasks generated from these):
--   BP_WATER_WEEKLY  — Watering, every 7 days, all garden
--   BP_WATER_BASIL   — Watering, every 3 days, no inventory link
--   BP_PRUNE_ROSE    — Pruning, every 30 days, seasonal
--   BP_INSPECT_FERN  — Inspection, every 14 days
--   BP_HARVEST       — Harvesting, every 7 days
--   BP_FERTILIZE     — Fertilizing, every 30 days
--   BP_PEST_CONTROL  — Pest Control, every 14 days, ailment blueprint type
--   BP_MAINTENANCE   — Maintenance, every 7 days
--
-- Standalone physical tasks (no blueprint, various states):
--   TASK_PENDING     — Watering, Pending, due CURRENT_DATE
--   TASK_COMPLETED   — Inspection, Completed, due CURRENT_DATE
--   TASK_SKIPPED     — Fertilizing, Skipped, due CURRENT_DATE - 1
--   TASK_OVERDUE     — Maintenance, Pending, due CURRENT_DATE - 7 (overdue!)
--   TASK_FUTURE      — Pruning, Pending, due CURRENT_DATE
--   TASK_WATERING    — Watering, Pending, due CURRENT_DATE (with location)
--   TASK_FERTILIZE   — Fertilizing, Pending, due CURRENT_DATE
--   TASK_PRUNING     — Pruning, Pending, due CURRENT_DATE + 5
--   TASK_HARVEST     — Harvesting, Pending, due CURRENT_DATE + 2
--   TASK_INSPECT     — Inspection, Pending, due CURRENT_DATE
--   TASK_PEST        — Pest Control, Pending, due CURRENT_DATE
--   TASK_MAINTAIN    — Maintenance, Pending, due CURRENT_DATE + 1
--   TASK_UNASSIGNED  — Maintenance, Pending, due CURRENT_DATE, NO location/area/plants
--                      (RHO-17: lands on the Garden Walk HOME step)
--   TASK_PERSONAL    — Maintenance, Pending, due CURRENT_DATE, scope='personal'
--                      (RHO-17: personal tasks join the walk's HOME step)
-- ============================================================

-- ---- Cleanup: remove ghost-converted physical tasks from previous runs ----
-- Ghost tasks that were marked complete or postponed create a physical task row
-- with a non-null blueprint_id. These suppress ghost display on subsequent runs.
-- The seeded standalone tasks all have blueprint_id = NULL (see below), so
-- deleting non-null blueprint_id tasks only removes ghost-derived rows.
DELETE FROM public.tasks
WHERE home_id = '00000000-0000-0000-0000-000000000002'
  AND blueprint_id IS NOT NULL;

-- Also remove any E2E throwaway tasks left over from previous runs
DELETE FROM public.tasks
WHERE home_id = '00000000-0000-0000-0000-000000000002'
  AND id NOT IN (
    '00000000-0000-0000-0006-000000000001',
    '00000000-0000-0000-0006-000000000002',
    '00000000-0000-0000-0006-000000000003',
    '00000000-0000-0000-0006-000000000004',
    '00000000-0000-0000-0006-000000000005',
    '00000000-0000-0000-0006-000000000006',
    '00000000-0000-0000-0006-000000000007',
    '00000000-0000-0000-0006-000000000008',
    '00000000-0000-0000-0006-000000000009',
    '00000000-0000-0000-0006-000000000010',
    '00000000-0000-0000-0006-000000000011',
    '00000000-0000-0000-0006-000000000012',
    '00000000-0000-0000-0006-000000000013',
    '00000000-0000-0000-0006-000000000014',
    '00000000-0000-0000-0006-000000000015'
  );

-- ---- Task Blueprints ----
-- Note: task_blueprints has no inventory_item_id column (dropped in migration 20260424)

INSERT INTO public.task_blueprints (
  id, home_id, title, task_type, frequency_days,
  start_date, end_date, is_recurring, priority,
  location_id, area_id, blueprint_type, scope, created_by
)
VALUES
  -- Weekly Watering — whole garden
  (
    '00000000-0000-0000-0005-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Weekly Garden Watering',
    'Watering',
    7,
    CURRENT_DATE - INTERVAL '30 days',
    NULL,
    true,
    'Medium',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Basil Watering — every 3 days
  (
    '00000000-0000-0000-0005-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Basil Watering',
    'Watering',
    3,
    CURRENT_DATE - INTERVAL '10 days',
    NULL,
    true,
    'High',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Rose Pruning — monthly, seasonal (Apr–Oct)
  (
    '00000000-0000-0000-0005-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Rose Pruning',
    'Pruning',
    30,
    CURRENT_DATE - INTERVAL '60 days',
    CURRENT_DATE + INTERVAL '180 days',
    true,
    'Medium',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000002',
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Fern Inspection — every 14 days
  (
    '00000000-0000-0000-0005-000000000004',
    '00000000-0000-0000-0000-000000000002',
    'Fern Health Inspection',
    'Inspection',
    14,
    CURRENT_DATE - INTERVAL '20 days',
    NULL,
    true,
    'Low',
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0002-000000000004',
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Tomato Harvest — weekly
  (
    '00000000-0000-0000-0005-000000000005',
    '00000000-0000-0000-0000-000000000002',
    'Tomato Harvest',
    'Harvesting',
    7,
    CURRENT_DATE,
    NULL,
    true,
    'High',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0002-000000000001',
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Monthly Fertilizing
  (
    '00000000-0000-0000-0005-000000000006',
    '00000000-0000-0000-0000-000000000002',
    'Monthly Fertilizing',
    'Fertilizing',
    30,
    CURRENT_DATE - INTERVAL '15 days',
    NULL,
    true,
    'Medium',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Pest Control — ailment blueprint type
  (
    '00000000-0000-0000-0005-000000000007',
    '00000000-0000-0000-0000-000000000002',
    'Aphid Pest Control',
    'Pest Control',
    14,
    CURRENT_DATE - INTERVAL '7 days',
    NULL,
    true,
    'High',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    'ailment',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- General Maintenance — weekly
  (
    '00000000-0000-0000-0005-000000000008',
    '00000000-0000-0000-0000-000000000002',
    'General Garden Maintenance',
    'Maintenance',
    7,
    CURRENT_DATE - INTERVAL '21 days',
    NULL,
    true,
    'Low',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Daily check — freq=1 so a ghost always exists regardless of UTC/local-time offset.
  -- Used by TASK-013/017/019/025 ghost tests which need at least one ghost visible today.
  (
    '00000000-0000-0000-0005-000000000009',
    '00000000-0000-0000-0000-000000000002',
    'Daily Garden Check',
    'Maintenance',
    1,
    CURRENT_DATE - INTERVAL '1 day',
    NULL,
    true,
    'Low',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO UPDATE SET
  title            = EXCLUDED.title,
  task_type        = EXCLUDED.task_type,
  frequency_days   = EXCLUDED.frequency_days,
  start_date       = EXCLUDED.start_date,
  end_date         = EXCLUDED.end_date,
  is_recurring     = EXCLUDED.is_recurring,
  priority         = EXCLUDED.priority,
  location_id      = EXCLUDED.location_id,
  area_id          = EXCLUDED.area_id,
  blueprint_type   = EXCLUDED.blueprint_type,
  scope            = EXCLUDED.scope,
  created_by       = EXCLUDED.created_by;

-- ---- Optimise tab fixtures — Greenhouse fragmentation pair ----
-- Two instance-level Watering blueprints in the (otherwise empty) Greenhouse area
-- with different frequencies → triggers the optimiser's fragmentation scenario.
-- Used by SCH-032 → SCH-039 in schedule-optimise.spec.ts. The Greenhouse area is
-- isolated — no other spec touches it — so adding fixtures here is safe.

-- Cleanup: remove any optimiser-created blueprints from previous Apply runs that
-- weren't undone. Targets the consolidated title pattern the optimiser uses.
DELETE FROM public.task_blueprints
WHERE home_id = '00000000-0000-0000-0000-000000000002'
  AND area_id = '00000000-0000-0000-0002-000000000003'
  AND id NOT IN (
    '00000000-0000-0000-0005-00000000000a',
    '00000000-0000-0000-0005-00000000000b'
  );

INSERT INTO public.inventory_items (
  id, home_id, plant_id, plant_name, status,
  location_id, location_name, area_id, area_name, identifier
)
VALUES
  -- Cucumber — Greenhouse
  (
    '00000000-0000-0000-0004-000000000010',
    '00000000-0000-0000-0000-000000000002',
    1000006,
    'Cucumber (Optimise Seed)',
    'Planted',
    '00000000-0000-0000-0001-000000000001',
    'Outside Garden',
    '00000000-0000-0000-0002-000000000003',
    'Greenhouse',
    'OPT-CUC-001'
  ),
  -- Pepper — Greenhouse
  (
    '00000000-0000-0000-0004-000000000011',
    '00000000-0000-0000-0000-000000000002',
    1000006,
    'Pepper (Optimise Seed)',
    'Planted',
    '00000000-0000-0000-0001-000000000001',
    'Outside Garden',
    '00000000-0000-0000-0002-000000000003',
    'Greenhouse',
    'OPT-PEP-001'
  )
ON CONFLICT (id) DO UPDATE SET
  plant_name    = EXCLUDED.plant_name,
  status        = EXCLUDED.status,
  location_id   = EXCLUDED.location_id,
  location_name = EXCLUDED.location_name,
  area_id       = EXCLUDED.area_id,
  area_name     = EXCLUDED.area_name;

INSERT INTO public.task_blueprints (
  id, home_id, title, task_type, frequency_days,
  start_date, end_date, is_recurring, priority,
  location_id, area_id, inventory_item_ids,
  blueprint_type, scope, created_by
)
VALUES
  -- Greenhouse Cucumber Watering — every 7 days
  (
    '00000000-0000-0000-0005-00000000000a',
    '00000000-0000-0000-0000-000000000002',
    'Greenhouse Cucumber Watering',
    'Watering',
    7,
    CURRENT_DATE - INTERVAL '14 days',
    NULL,
    true,
    'Medium',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    ARRAY['00000000-0000-0000-0004-000000000010']::uuid[],
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  ),
  -- Greenhouse Pepper Watering — every 3 days (different freq → fragmentation)
  (
    '00000000-0000-0000-0005-00000000000b',
    '00000000-0000-0000-0000-000000000002',
    'Greenhouse Pepper Watering',
    'Watering',
    3,
    CURRENT_DATE - INTERVAL '11 days',
    NULL,
    true,
    'Medium',
    '00000000-0000-0000-0001-000000000001',
    NULL,
    ARRAY['00000000-0000-0000-0004-000000000011']::uuid[],
    'plant',
    'home',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO UPDATE SET
  title             = EXCLUDED.title,
  task_type         = EXCLUDED.task_type,
  frequency_days    = EXCLUDED.frequency_days,
  start_date        = EXCLUDED.start_date,
  inventory_item_ids = EXCLUDED.inventory_item_ids,
  is_recurring      = true,
  is_archived       = false;

-- Reset any optimisation sessions accumulated from previous runs so the
-- "Past Changes" history starts empty each suite run (SCH-034 needs to assert
-- the first row appears; SCH-035 needs that same row to be the only one).
DELETE FROM public.optimisation_sessions
WHERE home_id = '00000000-0000-0000-0000-000000000002';

-- ---- Standalone Physical Tasks ----
-- Note: tasks uses inventory_item_ids uuid[] (plural array, added in migration 20260424)
-- These are NOT linked to blueprints so they don't hit the unique_blueprint_date constraint.

-- Pending watering task — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Water the Garden (standalone)',
  'Watering',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Completed inspection task — due today, marked done
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, completed_at, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000002',
  '00000000-0000-0000-0000-000000000002',
  'Morning Plant Inspection',
  'Inspection',
  'Completed',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}',
  now(),
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Completed', completed_at = now(), scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Skipped fertilizing task — due yesterday
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'Fertilize Beds (postponed)',
  'Fertilizing',
  'Skipped',
  CURRENT_DATE - INTERVAL '1 day',
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE - INTERVAL '1 day', status = 'Skipped', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Overdue pending task — due 7 days ago
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000004',
  '00000000-0000-0000-0000-000000000002',
  'Overdue Maintenance Check',
  'Maintenance',
  'Pending',
  CURRENT_DATE - INTERVAL '7 days',
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE - INTERVAL '7 days', status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Pruning task — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000005',
  '00000000-0000-0000-0000-000000000002',
  'Rose Hedge Pruning',
  'Pruning',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000002',
  ARRAY['00000000-0000-0000-0004-000000000003']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Unassigned home task — NO location, area or plants. RHO-17: the Garden
-- Walk's most-specific-step rule routes this to the HOME card (WALK-023).
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000014',
  '00000000-0000-0000-0000-000000000002',
  'Sweep the Potting Bench',
  'Maintenance',
  'Pending',
  CURRENT_DATE,
  NULL,
  NULL,
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', location_id = NULL, area_id = NULL, scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Personal-scope task — RHO-17 approved answer 6: the walker's personal
-- tasks join the Garden Walk HOME card, labelled "Personal".
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000015',
  '00000000-0000-0000-0000-000000000002',
  'Sharpen Your Secateurs',
  'Maintenance',
  'Pending',
  CURRENT_DATE,
  NULL,
  NULL,
  '{}',
  'personal',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', location_id = NULL, area_id = NULL, scope = 'personal', created_by = '00000000-0000-0000-0000-000000000001';

-- Watering task with full metadata — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000006',
  '00000000-0000-0000-0000-000000000002',
  'Water Basil Plants',
  'Watering',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000002']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Fertilizing — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000007',
  '00000000-0000-0000-0000-000000000002',
  'Apply Organic Fertilizer',
  'Fertilizing',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Pruning — due in 5 days
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000008',
  '00000000-0000-0000-0000-000000000002',
  'Deadhead Roses',
  'Pruning',
  'Pending',
  CURRENT_DATE + INTERVAL '5 days',
  '00000000-0000-0000-0001-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000003']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE + INTERVAL '5 days', status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Harvesting — due today, inside window (Wave 20 contract)
-- window_end_date = today + 7d, so the in-window 4-button footer renders.
-- Used by harvest-window.spec.ts HRV-001/002/003/004/009 and calendar tests.
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  window_end_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000009',
  '00000000-0000-0000-0000-000000000002',
  'Harvest Tomatoes',
  'Harvesting',
  'Pending',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '7 days',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  due_date         = CURRENT_DATE,
  window_end_date  = CURRENT_DATE + INTERVAL '7 days',
  next_check_at    = NULL,
  status           = 'Pending',
  scope            = 'home',
  created_by       = '00000000-0000-0000-0000-000000000001';

-- Harvesting — window closed (window_end_date 2 days ago) — exercises
-- the HarvestWindowClosedFooter (Log yield anyway / Mark missed).
-- Powers HRV-007 + HRV-008.
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  window_end_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000020',
  '00000000-0000-0000-0000-000000000002',
  'Pumpkin Final Harvest',
  'Harvesting',
  'Pending',
  CURRENT_DATE - INTERVAL '9 days',
  CURRENT_DATE - INTERVAL '2 days',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  due_date         = CURRENT_DATE - INTERVAL '9 days',
  window_end_date  = CURRENT_DATE - INTERVAL '2 days',
  next_check_at    = NULL,
  status           = 'Pending',
  scope            = 'home',
  created_by       = '00000000-0000-0000-0000-000000000001';

-- Harvesting — already snoozed via "Not yet 2 days" (Wave 22.0027 contract).
-- next_check_at = today + 2; due_date original = today; window_end = today + 4.
-- Used by HRV-005 (reappears on next_check_at) and the calendar-window spec
-- (snoozed dot moves to next_check_at, agenda hides/reveals correctly).
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  window_end_date, next_check_at,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000021',
  '00000000-0000-0000-0000-000000000002',
  'Strawberry Snooze Test',
  'Harvesting',
  'Pending',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '4 days',
  CURRENT_DATE + INTERVAL '2 days',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  due_date         = CURRENT_DATE,
  window_end_date  = CURRENT_DATE + INTERVAL '4 days',
  next_check_at    = CURRENT_DATE + INTERVAL '2 days',
  status           = 'Pending',
  scope            = 'home',
  created_by       = '00000000-0000-0000-0000-000000000001';

-- Inspection — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'Fern Health Check',
  'Inspection',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000002',
  ARRAY['00000000-0000-0000-0004-000000000004']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Pest Control — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000011',
  '00000000-0000-0000-0000-000000000002',
  'Aphid Treatment',
  'Pest Control',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Maintenance — due tomorrow
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000012',
  '00000000-0000-0000-0000-000000000002',
  'Clear Weeds from Borders',
  'Maintenance',
  'Pending',
  CURRENT_DATE + INTERVAL '1 day',
  '00000000-0000-0000-0001-000000000001',
  '{}',
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE + INTERVAL '1 day', status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';

-- Planting — due today (tests TASK-009 Planting badge)
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids, scope, created_by
)
VALUES (
  '00000000-0000-0000-0006-000000000013',
  '00000000-0000-0000-0000-000000000002',
  'Plant Seedlings in Raised Bed',
  'Planting',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[],
  'home',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending', scope = 'home', created_by = '00000000-0000-0000-0000-000000000001';
