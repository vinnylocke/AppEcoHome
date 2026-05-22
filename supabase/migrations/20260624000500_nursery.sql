-- ============================================================
-- THE NURSERY — seed packets + sowings + plant-out lifecycle
--
-- Three things land in one migration:
--   1. `seed_packets`  — what the home owns (variety, vendor, sow-by, etc.).
--   2. `seed_sowings`  — every batch sown from a packet, with a status
--      lifecycle: sown → germinated → planted_out / discarded.
--   3. `inventory_items.from_sowing_id`  — links a planted-out sowing
--      to the live plant instance it produced (one row per plant-out,
--      using the existing `quantity` column for batch counts).
--
-- Plus the `seed_packets_with_germination` VIEW that joins the latest
-- observed sowing into the packet row so the UI can paint the
-- viability chip in one query.
--
-- RLS: home-scoped via the existing `is_home_member` helper. Permission
-- gating (shed.edit) lives client-side in the UI; the SQL only enforces
-- membership so a member of one home can never read another home's
-- packets.
--
-- Idempotent — safe to re-run via `supabase migration up`.
-- ============================================================

-- 1. Packets ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seed_packets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  plant_id              int  REFERENCES public.plants(id) ON DELETE SET NULL,

  variety               text,
  vendor                text,
  purchased_on          date,
  opened_on             date,
  sow_by                date,
  quantity_remaining    text,

  notes                 text,
  is_archived           boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seed_packets IS
  'Seed packets owned by a home. The "Nursery" tab on /shed lists these. plant_id is nullable so a packet can exist before the user links it to a catalogue plant.';

CREATE INDEX IF NOT EXISTS seed_packets_home_idx
  ON public.seed_packets (home_id) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS seed_packets_sow_by_idx
  ON public.seed_packets (home_id, sow_by) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS seed_packets_plant_idx
  ON public.seed_packets (plant_id) WHERE plant_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_seed_packets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS seed_packets_set_updated_at ON public.seed_packets;
CREATE TRIGGER seed_packets_set_updated_at
  BEFORE UPDATE ON public.seed_packets
  FOR EACH ROW EXECUTE FUNCTION public.touch_seed_packets_updated_at();

-- 2. Sowings --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seed_sowings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  seed_packet_id        uuid NOT NULL REFERENCES public.seed_packets(id) ON DELETE CASCADE,

  sown_on               date NOT NULL,
  sown_count            int  NOT NULL CHECK (sown_count > 0 AND sown_count <= 1000),

  observed_on           date,
  germinated_count      int  CHECK (
                              germinated_count IS NULL
                              OR (germinated_count >= 0 AND germinated_count <= sown_count)
                            ),

  status                text NOT NULL DEFAULT 'sown'
                          CHECK (status IN ('sown', 'germinated', 'planted_out', 'discarded')),
  planted_out_at        date,

  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seed_sowings IS
  'A single batch sown from a packet. Lifecycle: sown -> germinated -> planted_out / discarded. observed_on + germinated_count are populated when the user logs the observation; planted_out_at is stamped when a sowing graduates to an inventory_items row.';

CREATE INDEX IF NOT EXISTS seed_sowings_packet_idx
  ON public.seed_sowings (seed_packet_id, sown_on DESC);
CREATE INDEX IF NOT EXISTS seed_sowings_home_idx
  ON public.seed_sowings (home_id);
CREATE INDEX IF NOT EXISTS seed_sowings_active_idx
  ON public.seed_sowings (seed_packet_id) WHERE status IN ('sown', 'germinated');

CREATE OR REPLACE FUNCTION public.touch_seed_sowings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS seed_sowings_set_updated_at ON public.seed_sowings;
CREATE TRIGGER seed_sowings_set_updated_at
  BEFORE UPDATE ON public.seed_sowings
  FOR EACH ROW EXECUTE FUNCTION public.touch_seed_sowings_updated_at();

-- 3. Inventory link -------------------------------------------------------

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS from_sowing_id uuid
  REFERENCES public.seed_sowings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_items_from_sowing_idx
  ON public.inventory_items (from_sowing_id) WHERE from_sowing_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_items.from_sowing_id IS
  'When a sowing graduates via the Plant Out flow, the resulting inventory_items row references the source seed_sowings row. Powers the "From the Nursery" badge on the Instance Edit Modal.';

-- 4. Latest-germination view ---------------------------------------------

CREATE OR REPLACE VIEW public.seed_packets_with_germination AS
SELECT
  sp.*,
  latest.observed_on                                  AS latest_germination_observed_on,
  latest.rate_pct                                     AS latest_germination_rate_pct,
  latest.sown_count                                   AS latest_germination_sample_size,
  active.id                                           AS active_sowing_id,
  active.status                                       AS active_sowing_status,
  active.sown_count                                   AS active_sowing_sown_count
FROM public.seed_packets sp
LEFT JOIN LATERAL (
  -- Most-recent OBSERVED sowing (drives the viability chip).
  SELECT
    observed_on,
    sown_count,
    ROUND(100.0 * germinated_count / NULLIF(sown_count, 0))::int AS rate_pct
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id
    AND germinated_count IS NOT NULL
  ORDER BY observed_on DESC NULLS LAST
  LIMIT 1
) latest ON TRUE
LEFT JOIN LATERAL (
  -- Most-recent IN-PROGRESS sowing (drives the "X sown · awaiting germination" chip).
  SELECT id, status, sown_count
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id
    AND status IN ('sown', 'germinated')
  ORDER BY sown_on DESC
  LIMIT 1
) active ON TRUE;

COMMENT ON VIEW public.seed_packets_with_germination IS
  'Packet row + latest observed sowing (for viability chip) + active in-progress sowing (for "awaiting germination" chip). Used by the Nursery list to paint each row in a single query.';

-- 5. RLS ------------------------------------------------------------------

ALTER TABLE public.seed_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_sowings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Home members read seed packets" ON public.seed_packets;
CREATE POLICY "Home members read seed packets"
  ON public.seed_packets FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

DROP POLICY IF EXISTS "Home members write seed packets" ON public.seed_packets;
CREATE POLICY "Home members write seed packets"
  ON public.seed_packets FOR ALL TO authenticated
  USING (public.is_home_member(home_id))
  WITH CHECK (public.is_home_member(home_id));

DROP POLICY IF EXISTS "Home members read sowings" ON public.seed_sowings;
CREATE POLICY "Home members read sowings"
  ON public.seed_sowings FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

DROP POLICY IF EXISTS "Home members write sowings" ON public.seed_sowings;
CREATE POLICY "Home members write sowings"
  ON public.seed_sowings FOR ALL TO authenticated
  USING (public.is_home_member(home_id))
  WITH CHECK (public.is_home_member(home_id));
