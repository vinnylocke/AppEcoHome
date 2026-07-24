-- Discover deck (#10) — authenticated random-sample RPC over plant_library.
--
-- The swipe deck ("Discover plants" in Garden Profile) used AI + Perenual as
-- its sources, so Sprout-tier users (no source enabled) hit a hard error. We
-- switch the deck to source from the internal `plant_library` — free for every
-- tier — while preserving the owned/disliked exclusions that the AI path applied
-- server-side.
--
-- The existing `plant_library_random_avoid_sample(int)` is service-role-only and
-- returns just keys (for the seeder's avoid list). This one is callable by the
-- browser client (authenticated), returns FULL rows for the card, and filters
-- out plants the home already owns or the user has disliked.
--
-- SECURITY DEFINER + a same-home membership guard: the exclusions reveal what a
-- home owns/dislikes, so only members of p_home_id may sample. Rotation-avoidance
-- (family-based, soft) is NOT ported here — it remains an AI-source nicety.

CREATE OR REPLACE FUNCTION public.plant_library_swipe_sample(
  p_home_id      uuid,
  p_sample_size  int,
  p_exclude_names text[] DEFAULT '{}'::text[]
)
RETURNS SETOF public.plant_library
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Same-home guard — non-members get nothing (never leak a home's plant data).
  IF NOT EXISTS (
    SELECT 1 FROM public.home_members
    WHERE home_id = p_home_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH excluded AS (
    -- Plants already in the shed
    SELECT lower(trim(plant_name)) AS n
    FROM public.inventory_items
    WHERE home_id = p_home_id AND plant_name IS NOT NULL
    UNION
    -- Plants the user has disliked (swipe / quiz negative prefs)
    SELECT lower(trim(entity_name))
    FROM public.planner_preferences
    WHERE (home_id = p_home_id OR user_id = auth.uid())
      AND entity_type = 'plant'
      AND sentiment = 'negative'
      AND entity_name IS NOT NULL
    UNION
    -- Client-provided already-seen names (this session)
    SELECT lower(trim(x))
    FROM unnest(coalesce(p_exclude_names, '{}'::text[])) AS x
  )
  SELECT pl.*
  FROM public.plant_library pl
  WHERE pl.common_name IS NOT NULL
    AND lower(trim(pl.common_name)) NOT IN (
      SELECT n FROM excluded WHERE n IS NOT NULL AND n <> ''
    )
  ORDER BY random()
  LIMIT greatest(0, coalesce(p_sample_size, 10));
END;
$$;

COMMENT ON FUNCTION public.plant_library_swipe_sample(uuid, int, text[]) IS
  'Discover deck (#10): random plant_library rows for a home member, excluding owned (inventory_items) + disliked (planner_preferences) + already-seen names. SECURITY DEFINER with a same-home membership guard.';

GRANT EXECUTE ON FUNCTION public.plant_library_swipe_sample(uuid, int, text[]) TO authenticated;
