-- ============================================================
-- SEED 10 — Yield Records (Section 16 — Yield E2E tests)
-- ============================================================
-- Requires: 00_bootstrap.sql, 02_plants_shed.sql
-- Seeds 3 past harvests for Basil (BAS-001) so the history
-- list is populated when YLD-007 asserts it on tab open.
-- UUID segment 0016 is reserved for yield records.
-- ============================================================

INSERT INTO public.yield_records (
  id, home_id, instance_id, value, unit, notes, harvested_at
)
VALUES
  (
    '00000000-0000-0000-0016-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0004-000000000002',
    0.150,
    'kg',
    'First harvest of the season.',
    '2026-04-01T09:00:00Z'
  ),
  (
    '00000000-0000-0000-0016-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0004-000000000002',
    0.200,
    'kg',
    NULL,
    '2026-04-15T09:00:00Z'
  ),
  (
    '00000000-0000-0000-0016-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0004-000000000002',
    0.180,
    'kg',
    'Good yield despite dry spell.',
    '2026-05-01T09:00:00Z'
  )
ON CONFLICT (id) DO UPDATE SET
  value        = EXCLUDED.value,
  unit         = EXCLUDED.unit,
  notes        = EXCLUDED.notes,
  harvested_at = EXCLUDED.harvested_at;

-- Set expected_harvest_date on BAS-001 for YLD-013 (persisted date assertion)
UPDATE public.inventory_items
SET expected_harvest_date = '2026-06-01'
WHERE id = '00000000-0000-0000-0004-000000000002';
