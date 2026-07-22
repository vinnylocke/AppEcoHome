-- ============================================================================
-- M3 — Legacy-archive backfill (Garden Hub v3 Stage C, 2026-07-22;
-- docs/plans/garden-hub-v3-presence-curation.md §4).
--
-- Pre-20260626000100 archives set inventory_items.status='Archived' with
-- ended_at NULL. Under the derived-presence model those rows read as NEITHER
-- Active (status excluded) NOR Inactive (no ended_at) — long-dead plants
-- would be invisible to the Inactive chip and, worse, their ailment links
-- would never resolve. Backfill ended_at so history is honest.
--
-- REVERSIBILITY: the snapshot table records every touched row's prior values
-- first. Restore script = replay the snapshot:
--   UPDATE public.inventory_items ii
--      SET ended_at = s.prior_ended_at, was_natural_end = s.prior_was_natural_end
--     FROM public.legacy_archive_snapshot s WHERE s.inventory_item_id = ii.id;
--
-- inventory_items has NO updated_at column (verified) — created_at is the
-- only honest fallback; it marks the record's age, which is the best
-- available approximation of "when this ended" for rows that never had one.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legacy_archive_snapshot (
  inventory_item_id uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  prior_status text NOT NULL,
  prior_ended_at timestamptz,
  prior_was_natural_end boolean,
  snapshotted_at timestamptz NOT NULL DEFAULT now()
);

-- Ops artefact: service-role only. RLS on with no policies = deny-all for
-- client roles; no Data-API grants issued.
ALTER TABLE public.legacy_archive_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO public.legacy_archive_snapshot (inventory_item_id, prior_status, prior_ended_at, prior_was_natural_end)
SELECT id, status, ended_at, was_natural_end
  FROM public.inventory_items
 WHERE status = 'Archived' AND ended_at IS NULL
ON CONFLICT (inventory_item_id) DO NOTHING;

UPDATE public.inventory_items
   SET ended_at = COALESCE(ended_at, created_at, now()),
       was_natural_end = COALESCE(was_natural_end, false)
 WHERE status = 'Archived' AND ended_at IS NULL;
