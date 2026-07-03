-- ============================================================
-- GARDEN WALK v2 — hierarchical route (RHO-17, Phase 1)
--
-- Generalises garden_walk_visits from a per-PLANT outcome log into a
-- per-STEP outcome log. The walk route is now Home → Locations →
-- Areas → Plants; section (home/location/area) cards record their own
-- done/skipped outcomes so a walk can be resumed the same day with
-- skipped sections reappearing and done ones dropping out.
--
--   garden_walk_visits.inventory_item_id  → nullable; section rows
--     identify themselves via section_kind (+ section_ref_id for
--     location/area sections). Exactly one identity per row.
--   outcome CHECK widened with 'section_done', 'section_skipped' and
--     'reading_logged' (readings land in Phase 2 — the outcome is
--     included now so the CHECK isn't rewritten twice).
--   garden_walk_sessions gains sections_visited + readings_logged
--     summary metric columns.
--
-- RLS unchanged: the existing session-owner INSERT policy keys off
-- session_id, so section rows ride the same policy. No new tables →
-- no new Data-API grants needed.
--
-- Idempotent — safe to re-run via `supabase migration up`.
-- ============================================================

-- 1. Visits become a step log — plant identity is now optional.
ALTER TABLE public.garden_walk_visits
  ALTER COLUMN inventory_item_id DROP NOT NULL;

ALTER TABLE public.garden_walk_visits
  ADD COLUMN IF NOT EXISTS section_kind   text,
  ADD COLUMN IF NOT EXISTS section_ref_id uuid;

COMMENT ON COLUMN public.garden_walk_visits.section_kind IS
  'Set on section-step rows: home | location | area | unassigned_plants. NULL on plant rows.';
COMMENT ON COLUMN public.garden_walk_visits.section_ref_id IS
  'locations.id / areas.id for location/area sections; NULL for home + unassigned_plants.';

ALTER TABLE public.garden_walk_visits
  DROP CONSTRAINT IF EXISTS garden_walk_visits_section_kind_chk;
ALTER TABLE public.garden_walk_visits
  ADD CONSTRAINT garden_walk_visits_section_kind_chk
  CHECK (
    section_kind IS NULL
    OR section_kind IN ('home', 'location', 'area', 'unassigned_plants')
  );

-- Exactly one identity per visit row: a plant OR a section, never both.
ALTER TABLE public.garden_walk_visits
  DROP CONSTRAINT IF EXISTS garden_walk_visits_identity_chk;
ALTER TABLE public.garden_walk_visits
  ADD CONSTRAINT garden_walk_visits_identity_chk
  CHECK (
    (inventory_item_id IS NOT NULL AND section_kind IS NULL)
    OR (inventory_item_id IS NULL AND section_kind IS NOT NULL)
  );

-- 2. Widen the outcome CHECK (drop + re-add — the original was an
--    inline column CHECK whose auto-generated name is
--    garden_walk_visits_outcome_check).
ALTER TABLE public.garden_walk_visits
  DROP CONSTRAINT IF EXISTS garden_walk_visits_outcome_check;
ALTER TABLE public.garden_walk_visits
  ADD CONSTRAINT garden_walk_visits_outcome_check
  CHECK (outcome IN (
    'all_good', 'snapped', 'noted', 'ailment_flagged', 'task_completed', 'skipped',
    'section_done', 'section_skipped', 'reading_logged'
  ));

-- Section-row lookups: "which sections did this user action today".
CREATE INDEX IF NOT EXISTS garden_walk_visits_section_idx
  ON public.garden_walk_visits (section_kind, section_ref_id, visited_at DESC)
  WHERE section_kind IS NOT NULL;

-- 3. Session summary metrics for the new step kinds.
ALTER TABLE public.garden_walk_sessions
  ADD COLUMN IF NOT EXISTS sections_visited int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readings_logged  int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.garden_walk_sessions.sections_visited IS
  'Section cards (home/location/area) marked done during the walk.';
COMMENT ON COLUMN public.garden_walk_sessions.readings_logged IS
  'Manual area soil readings logged from the walk (Phase 2 surface — column reserved).';
