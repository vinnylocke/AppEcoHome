-- ============================================================================
-- Favourite-ailment tier gate: a library-referenced favourite is the FREE
-- 'library' consumption tier (ailment-library overhaul Stage 1, 2026-07-21).
--
-- The previous trigger re-derived the gated source from ailment_library.source
-- when the favourite carried a library reference — but that column records who
-- AUTHORED the catalogue row ('ai' | 'perenual' | 'manual'; DEFAULT 'ai', and
-- most cron-seeded rows are 'ai'), NOT what plan is needed to consume it. The
-- catalogue is public-read for every authenticated user and adding any entry
-- to the watchlist is free on every tier by design (source='library'), so the
-- re-derivation made favouriting most library entries throw tier_locked_source
-- for non-AI tiers — a review-caught defect that ALSO latently affected the
-- existing watchlist heart whenever a home 'library' ailment name-resolved to
-- an AI-authored catalogue row.
--
-- New rule: a favourite that references a real ailment_library row gates as
-- 'library' (open to every tier — the FK proves it IS free library content;
-- there is nothing above-tier to smuggle, since the whole catalogue is free to
-- read). Tombstone favourites (no reference) keep gating on the claimed
-- source, exactly as before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_favourite_ailment_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ai       boolean;
  v_perenual boolean;
  v_source   text;
BEGIN
  -- Exempt service-role / direct SQL (no JWT).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(up.ai_enabled, false), COALESCE(up.enable_perenual, false)
    INTO v_ai, v_perenual
    FROM public.user_profiles up
   WHERE up.uid = NEW.user_id;

  -- Effective source: a library-referenced favourite IS free library content
  -- (see header). Tombstones fall back to the client's claimed source — low
  -- risk, because Home-tab ailments are viewable by every tier by design and
  -- the value-generating AI actions stay gated at their own call sites.
  v_source := NEW.source;
  IF NEW.ailment_library_id IS NOT NULL THEN
    v_source := 'library';
  END IF;

  IF v_source = 'ai' AND NOT COALESCE(v_ai, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'AI-sourced ailments require an AI-enabled plan.';
  END IF;
  IF v_source = 'perenual' AND NOT COALESCE(v_perenual, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'Plant-database ailments require a plan with the species database.';
  END IF;

  RETURN NEW;
END $$;
