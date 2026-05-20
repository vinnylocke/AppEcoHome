-- AI Plant Overhaul — Wave 1 / Schema
--
-- Adds the column set + tables that turn AI plants into a globally-shared
-- catalogue with per-home forks. No behaviour change yet — Wave 2+ wires
-- the edge functions and Wave 5-6 wires the UI.
--
-- See docs/plans/ai-plant-overhaul.md for the full design.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. New columns on plants
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plants
  -- Dedup key derived from the first scientific name (or common name fallback).
  -- GENERATED so it auto-stays in sync; can be used in unique indexes.
  ADD COLUMN IF NOT EXISTS scientific_name_key text GENERATED ALWAYS AS (
    lower(trim(regexp_replace(
      COALESCE(NULLIF(scientific_name->>0, ''), common_name),
      '\s+', ' ', 'g'
    )))
  ) STORED,

  -- Structured AI care guide payload. Separate from the legacy `data` jsonb
  -- so the new schema is clean and the diff helper has a predictable shape.
  ADD COLUMN IF NOT EXISTS care_guide_data jsonb,

  -- jsonb array of field names that changed in the most recent freshness
  -- check. Drives the per-field yellow highlight in Plant Edit / Instance
  -- Edit modal Care tabs. Cleared when the next check finds no changes.
  ADD COLUMN IF NOT EXISTS updated_care_fields jsonb,

  -- Bumps each time care_guide_data changes. Compared against
  -- user_plant_ack.seen_freshness_version to decide whether to show the
  -- "Updated" chip for a given user.
  ADD COLUMN IF NOT EXISTS freshness_version int NOT NULL DEFAULT 1,

  -- When the stale-check cron last evaluated this row. Drives the 90-day
  -- filter. NULL means "never checked, eligible immediately".
  ADD COLUMN IF NOT EXISTS last_freshness_check_at timestamptz,

  -- When the care guide was originally / most recently regenerated. Surfaced
  -- to the user as "Care guide refreshed N days ago".
  ADD COLUMN IF NOT EXISTS last_care_generated_at timestamptz,

  -- Self-reference: if this row is a per-home fork, points at the global
  -- parent. NULL for globals and pre-fork legacy plants.
  ADD COLUMN IF NOT EXISTS forked_from_plant_id integer
    REFERENCES public.plants(id) ON DELETE SET NULL,

  -- jsonb array of field names the user explicitly edited when forking.
  -- Used by the Plant Edit Modal to surface "Overridden" badges.
  ADD COLUMN IF NOT EXISTS overridden_fields jsonb;

COMMENT ON COLUMN public.plants.scientific_name_key
  IS 'Normalised dedup key (first scientific_name lowercased and whitespace-collapsed). Backbone of the global AI catalogue.';
COMMENT ON COLUMN public.plants.care_guide_data
  IS 'AI-generated structured care guide. See CARE_GUIDE_SCHEMA in supabase/functions/plant-doctor/index.ts.';
COMMENT ON COLUMN public.plants.updated_care_fields
  IS 'Array of field names that changed in the most recent stale-check regeneration. Drives the per-field highlight in the UI.';
COMMENT ON COLUMN public.plants.freshness_version
  IS 'Bumps on every care_guide_data change. Compared against user_plant_ack.seen_freshness_version to show the "Updated" chip.';
COMMENT ON COLUMN public.plants.last_freshness_check_at
  IS '90-day stale-check window driver. NULL means eligible immediately.';
COMMENT ON COLUMN public.plants.last_care_generated_at
  IS 'When the care guide was actually re-generated (vs. just verified unchanged). Shown to users as "Care guide refreshed N days ago".';
COMMENT ON COLUMN public.plants.forked_from_plant_id
  IS 'For home-scoped AI forks: the global parent this row was forked from. NULL on globals.';
COMMENT ON COLUMN public.plants.overridden_fields
  IS 'For home-scoped AI forks: array of field names the user explicitly changed. Drives "Overridden" badges in the Plant Edit Modal.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Dedup unique indexes
-- ──────────────────────────────────────────────────────────────────────────

-- Global catalogue: at most one AI row per species (no home_id).
CREATE UNIQUE INDEX IF NOT EXISTS plants_ai_global_dedup_idx
  ON public.plants (scientific_name_key)
  WHERE source = 'ai'
    AND home_id IS NULL
    AND scientific_name_key IS NOT NULL;

-- Per-home override: at most one fork per (home, species).
CREATE UNIQUE INDEX IF NOT EXISTS plants_ai_home_fork_dedup_idx
  ON public.plants (home_id, scientific_name_key)
  WHERE source = 'ai'
    AND home_id IS NOT NULL
    AND scientific_name_key IS NOT NULL;

-- Stale-check cron's primary scan: ordered by last_freshness_check_at on the
-- global AI subset. Partial index keeps it small.
CREATE INDEX IF NOT EXISTS plants_ai_global_stale_idx
  ON public.plants (last_freshness_check_at NULLS FIRST)
  WHERE source = 'ai' AND home_id IS NULL;

-- Fork lookup by parent (used by reset + orphan repair tooling).
CREATE INDEX IF NOT EXISTS plants_forked_from_idx
  ON public.plants (forked_from_plant_id)
  WHERE forked_from_plant_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. plant_care_revisions — full audit trail of care-guide changes
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plant_care_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id        integer NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  version         int     NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  source          text    NOT NULL
    CHECK (source IN ('initial', 'stale_check', 'manual_refresh', 'backfill')),
  care_guide_data jsonb   NOT NULL,
  changed_fields  jsonb,
  diff_summary    jsonb,
  triggered_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (plant_id, version)
);

CREATE INDEX IF NOT EXISTS plant_care_revisions_plant_id_idx
  ON public.plant_care_revisions(plant_id, version DESC);

COMMENT ON TABLE public.plant_care_revisions IS
  'Append-only audit trail of AI care-guide regenerations. One row per version per plant. Stores the full payload at that version plus the diff vs. previous.';

ALTER TABLE public.plant_care_revisions ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. user_plant_ack — per-user "I've seen version N of plant X"
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_plant_ack (
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id               integer NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  seen_freshness_version int NOT NULL DEFAULT 0,
  acked_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plant_id)
);

CREATE INDEX IF NOT EXISTS user_plant_ack_plant_id_idx
  ON public.user_plant_ack(plant_id);

COMMENT ON TABLE public.user_plant_ack IS
  'Tracks per-user, per-plant "last seen care-guide version". When plants.freshness_version > user_plant_ack.seen_freshness_version, the user sees the "Updated" chip.';

ALTER TABLE public.user_plant_ack ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. ai_plant_manual_refresh_log — rate-limit log for Sage+ "Refresh now"
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_plant_manual_refresh_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id     integer NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_plant_manual_refresh_log_lookup_idx
  ON public.ai_plant_manual_refresh_log(user_id, plant_id, refreshed_at DESC);

COMMENT ON TABLE public.ai_plant_manual_refresh_log IS
  'One row per Sage+ user-triggered manual refresh. Lookup query: "any row with refreshed_at > now() - interval ''7 days''" => rate-limited.';

ALTER TABLE public.ai_plant_manual_refresh_log ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Standard grants for the three new tables
-- ──────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_care_revisions       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plant_ack             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_plant_manual_refresh_log TO authenticated;

GRANT ALL ON public.plant_care_revisions        TO service_role;
GRANT ALL ON public.user_plant_ack              TO service_role;
GRANT ALL ON public.ai_plant_manual_refresh_log TO service_role;

-- Note: actual permission narrowing happens via RLS policies in the next
-- migration (20260620000100_ai_plant_overhaul_rls.sql).
