-- AI Plant Overhaul Wave 6 — in-place revert RPC
--
-- Restores a home-scoped AI fork's care data from its global parent without
-- deleting the row. The fork stays in TheShed (which today reads plants by
-- home_id), and rejoins the auto-update loop because:
--   - overridden_fields is cleared
--   - care_guide_data and the editable top-level columns are synced to the
--     parent's current values
--   - freshness_version is set to the parent's current version
--   - updated_care_fields is cleared
--   - user_plant_ack is seeded at the parent's current version (so no chip
--     flashes immediately on rejoin)
--
-- Why not reuse `reset_ai_plant_fork` (Wave 1)? That one repoints
-- inventory_items at the global and DELETEs the fork. Until D3 lands (TheShed
-- showing globals directly), deletion makes the plant disappear from the
-- user's shed entirely. This in-place revert is the forward-compatible
-- behaviour for today's data model. `reset_ai_plant_fork` is kept for the
-- post-D3 world.
--
-- Auth: caller must be a member of the fork's home (verified inside the fn).
-- SECURITY DEFINER so the UPDATE can touch ai_global care_guide_data via the
-- parent_row read even on tight RLS.

CREATE OR REPLACE FUNCTION public.revert_ai_plant_fork_in_place(
  p_fork_id integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fork_row    public.plants%ROWTYPE;
  parent_row  public.plants%ROWTYPE;
  caller_uid  uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO fork_row FROM public.plants WHERE id = p_fork_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fork_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF fork_row.source <> 'ai' OR fork_row.home_id IS NULL THEN
    RAISE EXCEPTION 'not_a_fork' USING ERRCODE = 'P0001';
  END IF;
  IF fork_row.forked_from_plant_id IS NULL THEN
    RAISE EXCEPTION 'no_parent_link' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must belong to the fork's home.
  IF NOT EXISTS (
    SELECT 1 FROM public.home_members
     WHERE home_id = fork_row.home_id AND user_id = caller_uid
  ) THEN
    RAISE EXCEPTION 'not_a_home_member' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO parent_row FROM public.plants WHERE id = fork_row.forked_from_plant_id;
  IF NOT FOUND OR parent_row.source <> 'ai' OR parent_row.home_id IS NOT NULL THEN
    RAISE EXCEPTION 'parent_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- Restore care data from the parent + clear overrides + sync to current version.
  -- We copy the editable AI care fields. Non-AI plant columns (e.g. labels,
  -- thumbnail_url) stay as the user has them — they're not part of the
  -- "catalogue" anyway.
  UPDATE public.plants SET
    care_guide_data         = parent_row.care_guide_data,
    sunlight                = parent_row.sunlight,
    watering                = parent_row.watering,
    cycle                   = parent_row.cycle,
    care_level              = parent_row.care_level,
    hardiness_min           = parent_row.hardiness_min,
    hardiness_max           = parent_row.hardiness_max,
    is_edible               = parent_row.is_edible,
    is_toxic_pets           = parent_row.is_toxic_pets,
    is_toxic_humans         = parent_row.is_toxic_humans,
    attracts                = parent_row.attracts,
    description             = parent_row.description,
    maintenance_notes       = parent_row.maintenance_notes,
    overridden_fields       = '[]'::jsonb,
    freshness_version       = parent_row.freshness_version,
    updated_care_fields     = NULL,
    last_care_generated_at  = parent_row.last_care_generated_at
  WHERE id = p_fork_id;

  -- Seed acks for every home member so no chip flashes immediately on rejoin.
  -- (Wave 5's chip compares parent.freshness_version > user_plant_ack.seen_version.)
  INSERT INTO public.user_plant_ack (user_id, plant_id, seen_freshness_version)
  SELECT hm.user_id, parent_row.id, parent_row.freshness_version
    FROM public.home_members hm
   WHERE hm.home_id = fork_row.home_id
  ON CONFLICT (user_id, plant_id) DO UPDATE
    SET seen_freshness_version = EXCLUDED.seen_freshness_version,
        acked_at = now();

  RETURN p_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_ai_plant_fork_in_place(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_ai_plant_fork_in_place(integer) TO authenticated;

COMMENT ON FUNCTION public.revert_ai_plant_fork_in_place IS
  'Restores a home-scoped AI fork''s care data from its global parent in-place. Clears overridden_fields, syncs care_guide_data + editable top-level columns + freshness_version, and seeds user_plant_ack so no "Updated" chip flashes immediately on rejoin. Called from "Reset to catalogue" in Plant Edit Modal. Wave 6 of AI Plant Overhaul.';
