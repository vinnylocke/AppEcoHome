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
    '00000000-0000-0000-0006-000000000013'
  );

-- ---- Task Blueprints ----
-- Note: task_blueprints has no inventory_item_id column (dropped in migration 20260424)

INSERT INTO public.task_blueprints (
  id, home_id, title, task_type, frequency_days,
  start_date, end_date, is_recurring, priority,
  location_id, area_id, blueprint_type
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
    'plant'
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
    'plant'
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
    'plant'
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
    'plant'
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
    'plant'
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
    'plant'
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
    'ailment'
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
    'plant'
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
    'plant'
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
  blueprint_type   = EXCLUDED.blueprint_type;

-- ---- Standalone Physical Tasks ----
-- Note: tasks uses inventory_item_ids uuid[] (plural array, added in migration 20260424)
-- These are NOT linked to blueprints so they don't hit the unique_blueprint_date constraint.

-- Pending watering task — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Water the Garden (standalone)',
  'Watering',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Completed inspection task — due today, marked done
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids, completed_at
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
  now()
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Completed', completed_at = now();

-- Skipped fertilizing task — due yesterday
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'Fertilize Beds (postponed)',
  'Fertilizing',
  'Skipped',
  CURRENT_DATE - INTERVAL '1 day',
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE - INTERVAL '1 day', status = 'Skipped';

-- Overdue pending task — due 7 days ago
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000004',
  '00000000-0000-0000-0000-000000000002',
  'Overdue Maintenance Check',
  'Maintenance',
  'Pending',
  CURRENT_DATE - INTERVAL '7 days',
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE - INTERVAL '7 days', status = 'Pending';

-- Pruning task — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids
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
  ARRAY['00000000-0000-0000-0004-000000000003']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Watering task with full metadata — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids
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
  ARRAY['00000000-0000-0000-0004-000000000002']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Fertilizing — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000007',
  '00000000-0000-0000-0000-000000000002',
  'Apply Organic Fertilizer',
  'Fertilizing',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Pruning — due in 5 days
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000008',
  '00000000-0000-0000-0000-000000000002',
  'Deadhead Roses',
  'Pruning',
  'Pending',
  CURRENT_DATE + INTERVAL '5 days',
  '00000000-0000-0000-0001-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000003']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE + INTERVAL '5 days', status = 'Pending';

-- Harvesting — due today (keeps badge visible even when ghost is suppressed)
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000009',
  '00000000-0000-0000-0000-000000000002',
  'Harvest Tomatoes',
  'Harvesting',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Inspection — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'Fern Health Check',
  'Inspection',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000002',
  ARRAY['00000000-0000-0000-0004-000000000004']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Pest Control — due today
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000011',
  '00000000-0000-0000-0000-000000000002',
  'Aphid Treatment',
  'Pest Control',
  'Pending',
  CURRENT_DATE,
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';

-- Maintenance — due tomorrow
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, inventory_item_ids
)
VALUES (
  '00000000-0000-0000-0006-000000000012',
  '00000000-0000-0000-0000-000000000002',
  'Clear Weeds from Borders',
  'Maintenance',
  'Pending',
  CURRENT_DATE + INTERVAL '1 day',
  '00000000-0000-0000-0001-000000000001',
  '{}'
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE + INTERVAL '1 day', status = 'Pending';

-- Planting — due today (tests TASK-009 Planting badge)
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  location_id, area_id, inventory_item_ids
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
  ARRAY['00000000-0000-0000-0004-000000000001']::uuid[]
)
ON CONFLICT (id) DO UPDATE SET due_date = CURRENT_DATE, status = 'Pending';
