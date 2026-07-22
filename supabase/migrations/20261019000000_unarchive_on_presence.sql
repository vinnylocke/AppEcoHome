-- ============================================================================
-- M4 — Clear-on-create invariant (Garden Hub v3 Stage C, 2026-07-22;
-- docs/plans/garden-hub-v3-presence-curation.md §2a).
--
-- `plants.is_archived` is the CURATION bit ("curated out of my garden").
-- Creating live presence for a plant — a new instance, a new sowing, or a
-- restored instance — contradicts "curated out", so it clears the bit.
-- Enforced as DB triggers so EVERY write path honours it (assignment modal,
-- bulk assign, add-another, plant-out, area wizard, agent-chat, restore).
--
-- SECURITY DEFINER with a MANDATORY same-home guard (review catch): the
-- definer path bypasses RLS, and inventory_items.plant_id is an enumerable
-- integer whose FK is not home-scoped — without `home_id = NEW.home_id` an
-- attacker could insert a junk row in their own home pointing at a victim
-- home's plant id and silently un-curate it. The guard makes the write
-- reachable only for rows in the SAME home as the inserted presence, which
-- is also the only semantically meaningful case. search_path pinned.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unarchive_plant_on_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plant_id IS NOT NULL THEN
    UPDATE public.plants
       SET is_archived = false
     WHERE id = NEW.plant_id
       AND home_id = NEW.home_id  -- same-home only (cross-home guard)
       AND is_archived;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_items_unarchive_plant ON public.inventory_items;
CREATE TRIGGER inventory_items_unarchive_plant
AFTER INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.unarchive_plant_on_presence();

-- Restoring an ended instance (History → Restore) is ALSO presence creation
-- (review catch: without this, a restore could leave a plant derived-Active
-- yet still curated out — the exact contradiction the invariant prevents).
DROP TRIGGER IF EXISTS inventory_items_unarchive_plant_restore ON public.inventory_items;
CREATE TRIGGER inventory_items_unarchive_plant_restore
AFTER UPDATE OF ended_at ON public.inventory_items
FOR EACH ROW
WHEN (OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL)
EXECUTE FUNCTION public.unarchive_plant_on_presence();

CREATE OR REPLACE FUNCTION public.unarchive_plant_on_sowing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.plants p
     SET is_archived = false
    FROM public.seed_packets sp
   WHERE sp.id = NEW.seed_packet_id
     AND sp.plant_id IS NOT NULL
     AND p.id = sp.plant_id
     AND p.home_id = NEW.home_id  -- same-home only (cross-home guard)
     AND p.is_archived;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS seed_sowings_unarchive_plant ON public.seed_sowings;
CREATE TRIGGER seed_sowings_unarchive_plant
AFTER INSERT ON public.seed_sowings
FOR EACH ROW EXECUTE FUNCTION public.unarchive_plant_on_sowing();

CREATE OR REPLACE FUNCTION public.unarchive_ailment_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.ailments
       SET is_archived = false
     WHERE id = NEW.ailment_id
       AND home_id = NEW.home_id  -- same-home only (cross-home guard)
       AND is_archived;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pia_unarchive_ailment ON public.plant_instance_ailments;
CREATE TRIGGER pia_unarchive_ailment
AFTER INSERT ON public.plant_instance_ailments
FOR EACH ROW EXECUTE FUNCTION public.unarchive_ailment_on_link();
