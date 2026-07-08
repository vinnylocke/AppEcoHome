-- AI plant freshness overhaul (docs/plans/ai-plant-freshness-and-edit-ux-
-- overhaul.md, fix C1): the "Apply updates" action in the care-update callout
-- pulls the global parent's CURRENT care data down into the home-scoped
-- shallow fork. Mechanically this is what revert_ai_plant_fork_in_place
-- already does — but the Wave-6 version missed the newer user-visible care
-- columns (watering_min/max_days, seasons, propagation, boolean traits,
-- plant_type), leaving them stale on the fork after a sync.
--
-- CREATE OR REPLACE with the full column set. Both the Revert button and the
-- new Apply-updates button call this same function.

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
    -- Full user-visible care set (2026-07-08 — previously missed):
    watering_min_days       = parent_row.watering_min_days,
    watering_max_days       = parent_row.watering_max_days,
    flowering_season        = parent_row.flowering_season,
    harvest_season          = parent_row.harvest_season,
    pruning_month           = parent_row.pruning_month,
    propagation             = parent_row.propagation,
    drought_tolerant        = parent_row.drought_tolerant,
    tropical                = parent_row.tropical,
    indoor                  = parent_row.indoor,
    medicinal               = parent_row.medicinal,
    cuisine                 = parent_row.cuisine,
    plant_type              = parent_row.plant_type,
    overridden_fields       = '[]'::jsonb,
    freshness_version       = parent_row.freshness_version,
    updated_care_fields     = NULL,
    last_care_generated_at  = parent_row.last_care_generated_at
  WHERE id = p_fork_id;

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

COMMENT ON FUNCTION public.revert_ai_plant_fork_in_place IS
  'Syncs a home-scoped AI fork''s care data from its global parent in-place (full user-visible column set as of 2026-07-08). Clears overridden_fields, syncs freshness_version, seeds user_plant_ack for all home members. Called by BOTH the "Apply updates" action in the care-update callout and the "Revert" button in Plant Edit Modal.';
