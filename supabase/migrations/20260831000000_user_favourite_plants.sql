-- ============================================================
-- CROSS-HOME FAVOURITES — Phase 1 (Plants).
--
-- User-scoped saves of plants that follow the USER across homes.
-- Identity = an immutable plant reference (per the 2026-07-03 design
-- decisions in docs/plans/cross-home-favourites.md):
--   * plant_id points at the canonical plants row — the GLOBAL catalogue
--     row for AI/library plants (resolved via forked_from_plant_id by the
--     client service), or the origin home row for manual/api/verdantly.
--   * Copy-on-write plant edits (fork-on-save for non-manual sources)
--     keep referenced rows immutable, so "always live" display is safe.
--   * The jsonb snapshot is ONLY a deletion tombstone — used to render
--     the favourite after the referenced row is gone (ON DELETE SET NULL).
--   * NO dedupe machinery: UNIQUE (user_id, plant_id) suffices.
--     Re-favouriting the same id upserts (refreshes the tombstone).
--
-- Phase 2 (user_favourite_ailments) and Phase 3 (user_favourite_seed_packets)
-- land in their own migrations — the 2026-07-03 identity redesign (immutable
-- id reference, no identity_key) invalidated the plan-body DDL for those two
-- tables, so they are deferred until their reference semantics are settled.
-- ============================================================

CREATE TABLE public.user_favourite_plants (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Immutable plant reference (see header). NULL after the referenced row
  -- is deleted — the favourite then renders from its tombstone columns.
  plant_id                 int REFERENCES public.plants(id) ON DELETE SET NULL,
  -- Tombstone columns, captured at favourite time (and refreshed on
  -- re-favourite). Live data through plant_id wins whenever it resolves.
  source                   text NOT NULL CHECK (source IN ('manual','api','ai','verdantly')),
  common_name              text NOT NULL,
  scientific_name          jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url                text,
  snapshot                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Informational only — "Saved from <home>" caption.
  favourited_from_home_id  uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plant_id)
);

COMMENT ON TABLE public.user_favourite_plants
  IS 'Cross-home favourites (Phase 1). User-scoped; plant_id is the immutable canonical reference, snapshot is a deletion tombstone only.';
COMMENT ON COLUMN public.user_favourite_plants.plant_id
  IS 'Canonical plants row: global catalogue id for AI/library favourites, origin row id otherwise. ON DELETE SET NULL -> tombstone render.';
COMMENT ON COLUMN public.user_favourite_plants.snapshot
  IS 'Deletion tombstone payload (capped care-card fields). Live data through plant_id always wins when the reference resolves.';

-- Per-user list read + FK-delete support.
CREATE INDEX user_fav_plants_user_idx  ON public.user_favourite_plants (user_id, created_at DESC);
CREATE INDEX user_fav_plants_plant_idx ON public.user_favourite_plants (plant_id) WHERE plant_id IS NOT NULL;

-- ── RLS — pure user-scoped (pattern: guide_bookmarks / user_plant_ack) ──
ALTER TABLE public.user_favourite_plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favourite plants" ON public.user_favourite_plants
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Data API grants (mandatory per CLAUDE.md for all new tables) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_plants TO authenticated;
-- No anon grants — favourites are always authenticated.

-- ── Server-side source × tier gate ──────────────────────────────────
-- Strict tier gating (2026-07-03 final decisions): favouriting a plant whose
-- source exceeds the viewer's entitlements is blocked server-side as well as
-- client-side. Favourites inserts are plain PostgREST writes, so a BEFORE
-- INSERT/UPDATE trigger is the enforcement point (no edge function exists on
-- this path, and a CHECK constraint cannot read user_profiles).
--
-- Matrix (flags on user_profiles):
--   source 'ai'              -> requires ai_enabled
--   source 'api'/'verdantly' -> requires enable_perenual
--   source 'manual'          -> open to every tier
--
-- The trigger also re-derives NEW.source from the referenced plants row so a
-- client cannot spoof a lower-gated source, and it runs with INVOKER rights so
-- plants visibility is still governed by RLS (a user cannot favourite a plant
-- they cannot see).
--
-- Service-role / direct-SQL writes (seeds, admin scripts) have no auth.uid()
-- and are exempt — RLS is bypassed for them anyway, and the seeded tier test
-- accounts deliberately carry above-tier favourites ("favourited before
-- downgrade") to exercise the view-only UI.
CREATE OR REPLACE FUNCTION public.enforce_favourite_plant_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source   text;
  v_ai       boolean;
  v_perenual boolean;
BEGIN
  -- Exempt service-role / direct SQL (no JWT).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.plant_id IS NOT NULL THEN
    SELECT p.source INTO v_source FROM public.plants p WHERE p.id = NEW.plant_id;
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'favourite_plant_not_visible'
        USING HINT = 'The referenced plant does not exist or is not visible to you.';
    END IF;
    NEW.source := v_source;  -- server-derived, not client-claimed
  ELSE
    v_source := NEW.source;  -- tombstone insert: gate on the claimed source
  END IF;

  SELECT COALESCE(up.ai_enabled, false), COALESCE(up.enable_perenual, false)
    INTO v_ai, v_perenual
    FROM public.user_profiles up
   WHERE up.uid = NEW.user_id;

  IF v_source = 'ai' AND NOT COALESCE(v_ai, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'AI-sourced plants require an AI-enabled plan.';
  END IF;
  IF v_source IN ('api', 'verdantly') AND NOT COALESCE(v_perenual, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'Plant-database plants require a plan with the species database.';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER user_favourite_plants_tier_gate
BEFORE INSERT OR UPDATE OF plant_id, source ON public.user_favourite_plants
FOR EACH ROW EXECUTE FUNCTION public.enforce_favourite_plant_tier();
