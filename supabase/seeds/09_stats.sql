-- ============================================================
-- SEED 09 — Instance Stats Tab
-- ============================================================
-- Requires: 00_bootstrap.sql, 02_plants_shed.sql,
--           03_tasks_blueprints.sql, 06_ailments_watchlist.sql
-- Covers test section: STT
--
-- Seeded for Basil (inventory item 0004-000000000002):
--   2 yield records   (prefix 000d)
--   1 completed Pruning task linked to Basil (0006-000000001001)
--   1 plant_instance_ailment linking Basil → Aphid (prefix 000e)
-- ============================================================

-- ---- Yield Records for Basil ----
INSERT INTO public.yield_records (id, home_id, instance_id, value, unit, harvested_at)
VALUES
  (
    '00000000-0000-0000-000d-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0004-000000000002',
    0.3,
    'kg',
    CURRENT_DATE - INTERVAL '14 days'
  ),
  (
    '00000000-0000-0000-000d-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0004-000000000002',
    0.2,
    'kg',
    CURRENT_DATE - INTERVAL '7 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ---- Completed Pruning Task linked to Basil ----
-- Note: blueprint_id = NULL so this avoids the unique_blueprint_date constraint.
-- Uses ID in the 000000001xxx range to avoid collision with 03_tasks_blueprints.sql
-- (which cleans up and re-seeds IDs 0006-000000000001 through 0006-000000000013).
-- Since this seed runs after 03, the task is inserted after the cleanup step.
INSERT INTO public.tasks (
  id, home_id, title, type, status, due_date,
  inventory_item_ids, blueprint_id, completed_at
)
VALUES (
  '00000000-0000-0000-0006-000000001001',
  '00000000-0000-0000-0000-000000000002',
  'Prune Basil',
  'Pruning',
  'Completed',
  CURRENT_DATE - INTERVAL '10 days',
  ARRAY['00000000-0000-0000-0004-000000000002']::uuid[],
  NULL,
  CURRENT_DATE - INTERVAL '10 days'
)
ON CONFLICT (id) DO UPDATE SET
  status       = 'Completed',
  due_date     = CURRENT_DATE - INTERVAL '10 days',
  completed_at = CURRENT_DATE - INTERVAL '10 days';

-- ---- Ailment Link: Basil → Aphid ----
-- Aphid ailment seeded in 06_ailments_watchlist.sql (0007-000000000001)
INSERT INTO public.plant_instance_ailments (id, plant_instance_id, ailment_id, home_id, status)
VALUES (
  '00000000-0000-0000-000e-000000000001',
  '00000000-0000-0000-0004-000000000002',
  '00000000-0000-0000-0007-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'active'
)
ON CONFLICT (plant_instance_id, ailment_id) DO NOTHING;
