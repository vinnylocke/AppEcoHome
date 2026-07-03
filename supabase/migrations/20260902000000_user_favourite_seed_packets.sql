-- ============================================================
-- CROSS-HOME FAVOURITES — Phase 3 (FINAL — Nursery seed packets).
--
-- User-scoped saves of seed packets that follow the USER across homes,
-- mirroring Phase 1 (user_favourite_plants) and Phase 2
-- (user_favourite_ailments). Design decisions in
-- docs/plans/cross-home-favourites.md (2026-07-03 appendices) +
-- docs/plans/cross-home-favourites-phase-3-nursery.md.
--
-- SNAPSHOT-ONLY — packets have NO canonical library (there is nothing like
-- the global `plants` catalogue or `ailment_library` to reference for "always
-- live" data). A packet favourite is a pure tombstone: the variety reference
-- (variety + vendor + plant identity) plus a jsonb snapshot of the reference
-- fields (sow-by, notes, quantity descriptor). It NEVER carries live stock or
-- sowings — those are physical home state that belongs to the packet in its
-- home.
--
-- Reference / identity:
--   * seed_packet_id points at the ORIGIN `seed_packets` row purely so the
--     "in this home" check and the Home-tab heart-fill can resolve. It is NOT
--     a live-data source — the card always renders from the snapshot columns.
--     ON DELETE SET NULL: the favourite survives the home packet's deletion.
--   * plant_id is the variety's plant (nullable), also ON DELETE SET NULL. It
--     is carried only so "add to this home" can re-link the recreated packet
--     to the same plant when that plant already exists in the target home.
--   * identity_key = lower(coalesce(variety,'') || '|' || coalesce(plant name,''))
--     is the single dedupe key. Unlike ailments (two partial uniques for the
--     library-ref vs tombstone split), packets always have exactly one identity
--     axis, so a plain UNIQUE (user_id, identity_key) suffices — re-favouriting
--     the same variety upserts (refreshes the snapshot + copied image).
--
-- Images:
--   * Packet images are HOME-scoped (`seed-packet-images/{home_id}/{packet_id}.jpg`).
--     To keep the favourite alive after the home packet is deleted, the client
--     copies the object to a favourite-scoped path
--     (`seed-packet-images/favourites/{user_id}/{favourite_id}.jpg`) at favourite
--     time and stores the public URL in copied_image_url. Handled gracefully
--     when the origin packet has no image (copied_image_url stays NULL).
--
-- Tier gating:
--   * NONE. Unlike plants/ailments, seed_packets have NO `source` column — they
--     are user-created (scanned / manually added), so the favourite is manual in
--     spirit. The favourite stores a variety reference, not AI/API-generated
--     content, and neither favouriting nor add-to-home makes any AI/API call.
--     Therefore there is NO tier trigger on this table (simpler than P1/P2).
--     See docs/plans/cross-home-favourites-phase-3-nursery.md for the full
--     justification.
-- ============================================================

CREATE TABLE public.user_favourite_seed_packets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Origin packet — tombstone/back-reference for the "in this home" check only,
  -- never a live-data source. NULL for favourites whose origin packet is gone.
  seed_packet_id           uuid REFERENCES public.seed_packets(id) ON DELETE SET NULL,
  -- The variety's plant (nullable). Carried so add-to-home can re-link the
  -- recreated packet when the plant already exists in the target home.
  plant_id                 int REFERENCES public.plants(id) ON DELETE SET NULL,
  -- Immutable identity columns, captured at favourite time (refreshed on
  -- re-favourite). The card renders purely from these + the snapshot.
  plant_common_name        text,
  variety                  text,
  vendor                   text,
  identity_key             text NOT NULL,
  -- Favourite-scoped copy of the packet image (survives the home packet's
  -- deletion). NULL when the origin packet had no image.
  copied_image_url         text,
  -- Reference fields only (sow_by, notes, quantity descriptor, purchase dates).
  -- NEVER live stock or sowings.
  snapshot                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Informational only — "Saved from <home>" caption.
  favourited_from_home_id  uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, identity_key)
);

COMMENT ON TABLE public.user_favourite_seed_packets
  IS 'Cross-home favourites (Phase 3 — nursery seed packets). User-scoped; SNAPSHOT-ONLY variety reference (no canonical library). seed_packet_id is a tombstone back-reference for the in-this-home check only.';
COMMENT ON COLUMN public.user_favourite_seed_packets.seed_packet_id
  IS 'Origin seed_packets row — tombstone/back-reference for the "in this home" check only, never a live-data source. ON DELETE SET NULL.';
COMMENT ON COLUMN public.user_favourite_seed_packets.identity_key
  IS 'Dedupe key: lower(coalesce(variety,'''') || ''|'' || coalesce(plant_common_name,'''')). UNIQUE per user.';
COMMENT ON COLUMN public.user_favourite_seed_packets.copied_image_url
  IS 'Public URL of the favourite-scoped image copy (seed-packet-images/favourites/{user_id}/{favourite_id}.jpg). NULL when the origin packet had no image.';
COMMENT ON COLUMN public.user_favourite_seed_packets.snapshot
  IS 'Variety reference fields (sow_by, notes, quantity_remaining descriptor, purchased_on, opened_on). NEVER live stock or sowings.';

-- Per-user list read + FK-delete support.
CREATE INDEX user_fav_packets_user_idx   ON public.user_favourite_seed_packets (user_id, created_at DESC);
CREATE INDEX user_fav_packets_packet_idx ON public.user_favourite_seed_packets (seed_packet_id) WHERE seed_packet_id IS NOT NULL;

-- ── RLS — pure user-scoped (pattern: guide_bookmarks / user_favourite_plants) ──
ALTER TABLE public.user_favourite_seed_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favourite seed packets" ON public.user_favourite_seed_packets
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Data API grants (mandatory per CLAUDE.md for all new tables) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_seed_packets TO authenticated;
-- No anon grants — favourites are always authenticated.

-- No tier trigger: seed_packets have no `source` column and packet favourites
-- involve zero AI/API calls, so there is no source × tier axis to enforce.
