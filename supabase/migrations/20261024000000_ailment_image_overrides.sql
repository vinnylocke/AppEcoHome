-- ============================================================
-- AILMENT IMAGE OVERRIDES — a home's chosen image for an ailment
--
-- Feature: image tap → right/wrong → remove & replace
-- (docs/plans/image-judge-and-replace.md, 2026-07-23).
--
-- `ailment_library` is GLOBAL and client-read-only — a home can never write the
-- shared catalogue row (and writing it would change the image for EVERY home).
-- So a home's chosen ailment image lives here, home-scoped. This table is the
-- source of truth for ailment imagery on surfaces with NO home ailments row
-- (browsing the library / a favourited library ailment / the field guide). For
-- a real home watchlist row the replace ALSO mirrors into ailments.thumbnail_url
-- so the card renders without a join.
--
-- Ailment identity mirrors user_favourite_ailments: home `ailments` rows carry
-- no FK back to `ailment_library`, so the client resolves ailment_library_id by
-- the library's `name_key` at override time (best-effort); when no library row
-- matches (manual / one-off ailments) the reference is NULL and identity_key
-- (lowercased trimmed name) is the bridge. Hence the two partial uniques below.
--
-- Resolution order for an ailment image becomes:
--   (1) home ailments.thumbnail_url (if a watchlist row exists)
--   (2) ailment_image_overrides.image_url for this home + library id / identity_key
--   (3) ailment_library.image_url / thumbnail_url
--   (4) KindIcon tile (graceful floor).
-- ============================================================

CREATE TABLE public.ailment_image_overrides (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id            uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  -- Canonical library row when it resolves (matched by name_key at override
  -- time). NULLABLE; ailment_library.id is BIGINT. ON DELETE CASCADE: drop the
  -- override if the library row is pruned (library curation is rare, and this
  -- avoids an orphaned partial-unique conflict on identity_key).
  ailment_library_id bigint REFERENCES public.ailment_library(id) ON DELETE CASCADE,
  -- Lowercased trimmed name (mirrors ailment_library.name_key); the bridge/dedupe
  -- key when no library row matches. Always populated.
  identity_key       text NOT NULL,
  image_url          text NOT NULL,
  thumb_url          text,
  -- Attribution/licence carried from the chosen candidate (imageCredit.ts) so it
  -- survives the swap (esp. iNaturalist CC + other attributed sources).
  image_credit       jsonb,
  source             text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ailment_image_overrides IS
  'Per-home chosen ailment image (ailment_library is global read-only). Source of truth for ailment imagery on library/field-guide/favourite surfaces; mirrored into ailments.thumbnail_url for home watchlist rows. Bridged to the bigint library id by name_key, else by identity_key.';

-- Two partial uniques (like user_favourite_ailments): library-backed overrides
-- dedupe by library id; library-less by identity_key. PostgREST can't
-- disambiguate on_conflict across them, so client writes are find-then-upsert.
CREATE UNIQUE INDEX ailment_image_overrides_library_uniq
  ON public.ailment_image_overrides (home_id, ailment_library_id)
  WHERE ailment_library_id IS NOT NULL;
CREATE UNIQUE INDEX ailment_image_overrides_identity_uniq
  ON public.ailment_image_overrides (home_id, identity_key)
  WHERE ailment_library_id IS NULL;
-- Per-home list read + FK-delete support.
CREATE INDEX ailment_image_overrides_home_idx
  ON public.ailment_image_overrides (home_id);

ALTER TABLE public.ailment_image_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home ailment image overrides" ON public.ailment_image_overrides
  FOR ALL TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())));

-- Data API grants (mandatory per CLAUDE.md). UPDATE allowed (re-choosing an
-- image edits the existing row). No anon grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ailment_image_overrides TO authenticated;
