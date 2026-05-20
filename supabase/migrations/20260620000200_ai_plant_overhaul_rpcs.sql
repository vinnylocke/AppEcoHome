-- AI Plant Overhaul — Wave 1 / RPCs
--
-- Two SECURITY DEFINER functions called by the client when the user:
--   1. Saves edits to an AI plant from Plant Edit Modal (fork_ai_plant_for_home)
--   2. Resets a fork back to the catalogue (reset_ai_plant_fork)
--
-- SECURITY DEFINER lets the functions touch rows the caller's role couldn't
-- touch directly (e.g. updating a global AI plant during reset's ack seeding).
-- Both functions perform their own home-membership check before doing
-- anything, so they're safe to expose.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. fork_ai_plant_for_home — atomic detach-and-fork
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fork_ai_plant_for_home(
  p_plant_id          integer,
  p_home_id           uuid,
  p_edits             jsonb,                -- partial care_guide_data overrides to merge
  p_overridden_fields jsonb                  -- array of field names the user changed
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.plants%ROWTYPE;
  fork_id    integer;
  caller_uid uuid := auth.uid();
BEGIN
  -- Auth gate: caller must be signed in and a member of the home.
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.home_members
     WHERE home_id = p_home_id AND user_id = caller_uid
  ) THEN
    RAISE EXCEPTION 'not_a_home_member' USING ERRCODE = 'P0001';
  END IF;

  -- Plant must be a global AI row (not already a fork, not from another provider).
  SELECT * INTO parent_row FROM public.plants WHERE id = p_plant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plant_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF parent_row.source <> 'ai' OR parent_row.home_id IS NOT NULL THEN
    RAISE EXCEPTION 'not_a_global_ai_plant' USING ERRCODE = 'P0001';
  END IF;

  -- Insert the fork. Carries over identity + display fields from the parent,
  -- merges p_edits into care_guide_data, starts at freshness_version = 1.
  INSERT INTO public.plants (
    common_name, scientific_name, other_names, family, plant_type,
    cycle, image_url, thumbnail_url, watering, watering_benchmark,
    sunlight, care_level, hardiness_min, hardiness_max,
    is_edible, is_toxic_pets, is_toxic_humans, attracts,
    description, maintenance_notes,
    source, home_id,
    care_guide_data, freshness_version, last_care_generated_at,
    last_freshness_check_at,
    forked_from_plant_id, overridden_fields
  ) VALUES (
    parent_row.common_name, parent_row.scientific_name, parent_row.other_names,
    parent_row.family, parent_row.plant_type, parent_row.cycle,
    parent_row.image_url, parent_row.thumbnail_url,
    parent_row.watering, parent_row.watering_benchmark,
    parent_row.sunlight, parent_row.care_level,
    parent_row.hardiness_min, parent_row.hardiness_max,
    parent_row.is_edible, parent_row.is_toxic_pets, parent_row.is_toxic_humans,
    parent_row.attracts,
    parent_row.description, parent_row.maintenance_notes,
    'ai', p_home_id,
    -- jsonb concat: p_edits keys override parent values
    COALESCE(parent_row.care_guide_data, '{}'::jsonb) || COALESCE(p_edits, '{}'::jsonb),
    1,
    parent_row.last_care_generated_at,
    NULL,
    parent_row.id,
    p_overridden_fields
  )
  RETURNING id INTO fork_id;

  -- Repoint inventory: all of this home's instances of the parent now point
  -- at the fork.
  UPDATE public.inventory_items
     SET plant_id = fork_id
   WHERE home_id = p_home_id
     AND plant_id = p_plant_id;

  -- Seed user_plant_ack rows for every member of the home at v1 so the
  -- "Updated" chip never shows on a freshly-created fork.
  INSERT INTO public.user_plant_ack (user_id, plant_id, seen_freshness_version)
  SELECT hm.user_id, fork_id, 1
    FROM public.home_members hm
   WHERE hm.home_id = p_home_id
  ON CONFLICT (user_id, plant_id) DO UPDATE
    SET seen_freshness_version = EXCLUDED.seen_freshness_version,
        acked_at = now();

  RETURN fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fork_ai_plant_for_home(integer, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fork_ai_plant_for_home(integer, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fork_ai_plant_for_home IS
  'Forks a global AI plant for a specific home. Inserts a home-scoped plants row, repoints inventory_items, seeds user_plant_ack. Called when user confirms the detach-on-edit modal in Plant Edit Modal.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. reset_ai_plant_fork — return a fork to the global catalogue
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_ai_plant_fork(
  p_fork_id integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fork_row     public.plants%ROWTYPE;
  parent_id    integer;
  parent_version int;
  caller_uid   uuid := auth.uid();
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

  -- Caller must belong to the fork's home.
  IF NOT EXISTS (
    SELECT 1 FROM public.home_members
     WHERE home_id = fork_row.home_id AND user_id = caller_uid
  ) THEN
    RAISE EXCEPTION 'not_a_home_member' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve parent: prefer the recorded forked_from_plant_id; fall back to
  -- scientific_name_key lookup if the parent was deleted in between.
  parent_id := fork_row.forked_from_plant_id;

  IF parent_id IS NULL THEN
    SELECT id INTO parent_id
      FROM public.plants
     WHERE source = 'ai'
       AND home_id IS NULL
       AND scientific_name_key = fork_row.scientific_name_key
     LIMIT 1;
  ELSE
    -- Verify the recorded parent still exists and is global.
    PERFORM 1 FROM public.plants
     WHERE id = parent_id AND source = 'ai' AND home_id IS NULL;
    IF NOT FOUND THEN
      -- Parent has gone — try the key fallback before giving up.
      SELECT id INTO parent_id
        FROM public.plants
       WHERE source = 'ai'
         AND home_id IS NULL
         AND scientific_name_key = fork_row.scientific_name_key
       LIMIT 1;
    END IF;
  END IF;

  IF parent_id IS NULL THEN
    RAISE EXCEPTION 'no_global_parent_available' USING ERRCODE = 'P0001';
  END IF;

  SELECT freshness_version INTO parent_version
    FROM public.plants WHERE id = parent_id;

  -- Repoint inventory back to the parent.
  UPDATE public.inventory_items
     SET plant_id = parent_id
   WHERE home_id = fork_row.home_id
     AND plant_id = p_fork_id;

  -- Seed acks for every home member so no chip flashes immediately on rejoin.
  INSERT INTO public.user_plant_ack (user_id, plant_id, seen_freshness_version)
  SELECT hm.user_id, parent_id, parent_version
    FROM public.home_members hm
   WHERE hm.home_id = fork_row.home_id
  ON CONFLICT (user_id, plant_id) DO UPDATE
    SET seen_freshness_version = EXCLUDED.seen_freshness_version,
        acked_at = now();

  -- Drop the fork. Its user_plant_ack rows cascade-delete via the FK.
  DELETE FROM public.plants WHERE id = p_fork_id;

  RETURN parent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_ai_plant_fork(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_ai_plant_fork(integer) TO authenticated;

COMMENT ON FUNCTION public.reset_ai_plant_fork IS
  'Resets a home-scoped AI fork back to the global catalogue. Repoints inventory_items at the global parent, seeds user_plant_ack at the parent''s current version, deletes the fork row. Called from "Reset to catalogue" button in Plant Edit Modal.';
