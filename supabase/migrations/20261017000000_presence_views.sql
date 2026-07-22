-- ============================================================================
-- Presence views (Garden Hub v3 Stage A, 2026-07-22 — the "derived, never
-- toggled" axis of the Presence × Curation model;
-- docs/plans/garden-hub-v3-presence-curation.md §2b).
--
-- ONE canonical definition of Active / Inactive, shared by the client hook,
-- edge functions and agent-chat executors — instead of hand-rolled
-- derivations drifting apart.
--
-- Rules (owner-locked 2026-07-22):
--   Plant ACTIVE   — any live instance (ended_at IS NULL AND status <>
--                    'Archived'; Unplanted COUNTS — it's in your care), OR any
--                    sowing in ('sown','germinated') via the packet's
--                    plant_id (DIRECT join — packet is_archived deliberately
--                    ignored: archiving a packet mid-germination must not
--                    flip the plant's presence).
--   Plant INACTIVE — not Active, and any ended instance OR discarded sowing.
--   Ailment ACTIVE — any plant_instance_ailments link with status='active'
--                    whose instance is live (same live predicate).
--   Ailment INACTIVE — not Active, and any pia link exists (resolved / on an
--                    ended instance) OR any area-scan sighting (scans are
--                    HISTORY EVIDENCE, never Active — they have no resolved
--                    state; counting them would make an ailment immortal).
--   Neither        — the row simply doesn't appear in the view ('none').
--
-- Keyed on ended_at, never bare status: bulk end-of-life double-writes
-- status='Archived' alongside ended_at, and pre-20260626000100 legacy rows
-- carry status='Archived' with ended_at NULL (backfilled in Stage C's M3 —
-- until then those legacy rows read as Active here, matching the old UI's
-- pre-derivation behaviour rather than inventing a third state).
--
-- Views run with the invoker's rights — RLS on the underlying tables governs
-- visibility exactly as for direct queries (security_invoker, PG15+).
-- ============================================================================

CREATE OR REPLACE VIEW public.plant_presence
WITH (security_invoker = on) AS
WITH live AS (
  SELECT DISTINCT ii.plant_id, ii.home_id
    FROM public.inventory_items ii
   WHERE ii.ended_at IS NULL AND ii.status <> 'Archived'
  UNION
  SELECT DISTINCT sp.plant_id, ss.home_id
    FROM public.seed_sowings ss
    JOIN public.seed_packets sp ON sp.id = ss.seed_packet_id
   WHERE ss.status IN ('sown', 'germinated') AND sp.plant_id IS NOT NULL
),
historic AS (
  SELECT DISTINCT ii.plant_id, ii.home_id
    FROM public.inventory_items ii
   WHERE ii.ended_at IS NOT NULL
  UNION
  SELECT DISTINCT sp.plant_id, ss.home_id
    FROM public.seed_sowings ss
    JOIN public.seed_packets sp ON sp.id = ss.seed_packet_id
   WHERE ss.status = 'discarded' AND sp.plant_id IS NOT NULL
)
SELECT
  COALESCE(l.plant_id, h.plant_id) AS plant_id,
  COALESCE(l.home_id, h.home_id)   AS home_id,
  CASE WHEN l.plant_id IS NOT NULL THEN 'active' ELSE 'inactive' END AS presence
FROM live l
FULL OUTER JOIN historic h
  ON h.plant_id = l.plant_id AND h.home_id = l.home_id;

CREATE OR REPLACE VIEW public.ailment_presence
WITH (security_invoker = on) AS
WITH live AS (
  SELECT DISTINCT pia.ailment_id, pia.home_id
    FROM public.plant_instance_ailments pia
    JOIN public.inventory_items ii ON ii.id = pia.plant_instance_id
   WHERE pia.status = 'active'
     AND ii.ended_at IS NULL AND ii.status <> 'Archived'
),
historic AS (
  SELECT DISTINCT pia.ailment_id, pia.home_id
    FROM public.plant_instance_ailments pia
  UNION
  SELECT DISTINCT asa.ailment_id, a.home_id
    FROM public.area_scan_ailments asa
    JOIN public.ailments a ON a.id = asa.ailment_id
   WHERE asa.ailment_id IS NOT NULL
)
SELECT
  COALESCE(l.ailment_id, h.ailment_id) AS ailment_id,
  COALESCE(l.home_id, h.home_id)       AS home_id,
  CASE WHEN l.ailment_id IS NOT NULL THEN 'active' ELSE 'inactive' END AS presence
FROM live l
FULL OUTER JOIN historic h
  ON h.ailment_id = l.ailment_id AND h.home_id = l.home_id;

-- Data API exposure (post-2026-10-30 rule: new relations need explicit
-- grants; RLS on the underlying tables still gates the rows).
GRANT SELECT ON public.plant_presence  TO authenticated;
GRANT SELECT ON public.ailment_presence TO authenticated;
