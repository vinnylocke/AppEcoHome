-- ============================================================
-- SEED 12 — Shopping Lists
-- ============================================================
-- Fixed prefix: 00000000-0000-0000- (substituted per worker by seed-test-db.mjs)
-- List UUIDs   : 00000000-0000-0000-0011-00000000000{n}
-- Item UUIDs   : 00000000-0000-0000-0012-00000000000{n}
--
-- List 1 (active):  "Weekly Garden Shop"
--   - Item 1: plant "Basil Seeds",       unchecked, source=null  — not yet purchased
--   - Item 2: plant "Tomato Seedlings",  checked,   source=null  — purchased, eligible for Add to Shed
--   - Item 3: plant "Mint",              checked,   source=shed  — shed-sourced, excluded from Add to Shed
--   - Item 4: product "Fertiliser",      unchecked, category=Fertiliser
-- List 2 (completed): "Last Week's Shop"
--   - Item 5: plant "Rose Cutting",      checked,   already_in_shed=true — already added, excluded
--   - Item 6: product "Pruning Shears",  checked,   category=Tools
--
-- Safe to re-run: all statements use ON CONFLICT DO NOTHING.
-- ============================================================

-- ── Lists ──────────────────────────────────────────────────────────────────────

INSERT INTO public.shopping_lists (id, home_id, name, status)
VALUES
  ('00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002', 'Weekly Garden Shop',  'active'),
  ('00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000000002', 'Last Week''s Shop', 'completed')
ON CONFLICT (id) DO NOTHING;

-- ── Items for List 1 (active) ─────────────────────────────────────────────────

-- Item 1: plant, unchecked, no source — not yet purchased
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, source, already_in_shed)
VALUES ('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002',
        'plant', 'Basil Seeds', false, null, false)
ON CONFLICT (id) DO NOTHING;

-- Item 2: plant, checked, no source — purchased, NOT shed-sourced → eligible for "Add to Shed"
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, source, already_in_shed)
VALUES ('00000000-0000-0000-0012-000000000002', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002',
        'plant', 'Tomato Seedlings', true, null, false)
ON CONFLICT (id) DO NOTHING;

-- Item 3: plant, checked, source=shed — shed-sourced → excluded from "Add to Shed" button
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, source, already_in_shed)
VALUES ('00000000-0000-0000-0012-000000000003', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002',
        'plant', 'Mint', true, 'shed', false)
ON CONFLICT (id) DO NOTHING;

-- Item 4: product, unchecked
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, category)
VALUES ('00000000-0000-0000-0012-000000000004', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000002',
        'product', 'Fertiliser', false, 'Fertiliser')
ON CONFLICT (id) DO NOTHING;

-- ── Planner Phase 1 pre-completion (for Phase 2 Select All tests) ───────────
-- Mark the "Summer Veg Plan" Phase 1 as done so Phase 2 is accessible in tests.
-- Sets linked_area_id = Raised Bed A. Idempotent — only patches if not already set.
UPDATE public.plans
SET staging_state = staging_state || '{"linked_area_id": "00000000-0000-0000-0002-000000000001", "linked_area_name": "Raised Bed A"}'::jsonb
WHERE id = '00000000-0000-0000-0008-000000000001'
  AND (staging_state->>'linked_area_id') IS NULL;

-- ── Items for List 2 (completed) ─────────────────────────────────────────────

-- Item 5: plant, checked, already_in_shed=true → excluded from "Add to Shed"
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, source, already_in_shed)
VALUES ('00000000-0000-0000-0012-000000000005', '00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000000002',
        'plant', 'Rose Cutting', true, null, true)
ON CONFLICT (id) DO NOTHING;

-- Item 6: product, checked
INSERT INTO public.shopping_list_items (id, list_id, home_id, item_type, name, is_checked, category)
VALUES ('00000000-0000-0000-0012-000000000006', '00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000000002',
        'product', 'Pruning Shears', true, 'Tools')
ON CONFLICT (id) DO NOTHING;
