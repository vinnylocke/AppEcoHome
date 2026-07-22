-- ============================================================================
-- Favourite-plant tier gate: a GLOBAL-CATALOGUE plant is the FREE 'library'
-- consumption tier (Garden Hub v3 Stage A, 2026-07-22 — the plants-side
-- mirror of 20261015000000's ailment fix).
--
-- The trigger re-derives NEW.source from the referenced plants row so clients
-- cannot spoof a gated source — correct for HOME-scoped rows. But global
-- catalogue rows (plants.home_id IS NULL) record who AUTHORED the entry
-- ('ai' | 'api' | 'verdantly' | 'manual'), NOT what plan is needed to consume
-- it: the catalogue is public-read for every authenticated user by design, so
-- hearting a catalogue plant is free on every tier — exactly as hearting a
-- library ailment already is. Without this carve-out, saving most catalogue
-- plants throws tier_locked_source for non-AI tiers (the "hearts at search"
-- blocker first spotted in the ailment-library overhaul Stage 4 review).
--
-- New rule: NEW.source still stores the REAL derived source (UI badges stay
-- honest); only the GATE treats a catalogue-referenced favourite as free
-- 'library' consumption. Home-scoped references and tombstones gate exactly
-- as before. AI actions stay gated at their own call sites.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_favourite_plant_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source    text;
  v_home      uuid;
  v_effective text;
  v_ai        boolean;
  v_perenual  boolean;
BEGIN
  -- Exempt service-role / direct SQL (no JWT).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.plant_id IS NOT NULL THEN
    SELECT p.source, p.home_id INTO v_source, v_home
      FROM public.plants p WHERE p.id = NEW.plant_id;
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'favourite_plant_not_visible'
        USING HINT = 'The referenced plant does not exist or is not visible to you.';
    END IF;
    NEW.source := v_source;  -- server-derived, not client-claimed
  ELSE
    v_source := NEW.source;  -- tombstone insert: gate on the claimed source
    v_home   := NULL;
  END IF;

  -- Effective GATE source: a favourite referencing a global catalogue row
  -- (home_id IS NULL) is free library consumption — the FK proves the content
  -- is already readable by every tier; there is nothing above-tier to smuggle.
  v_effective := v_source;
  IF NEW.plant_id IS NOT NULL AND v_home IS NULL THEN
    v_effective := 'library';
  END IF;

  SELECT COALESCE(up.ai_enabled, false), COALESCE(up.enable_perenual, false)
    INTO v_ai, v_perenual
    FROM public.user_profiles up
   WHERE up.uid = NEW.user_id;

  IF v_effective = 'ai' AND NOT COALESCE(v_ai, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'AI-sourced plants require an AI-enabled plan.';
  END IF;
  IF v_effective IN ('api', 'verdantly') AND NOT COALESCE(v_perenual, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'Plant-database plants require a plan with the species database.';
  END IF;

  RETURN NEW;
END $$;
