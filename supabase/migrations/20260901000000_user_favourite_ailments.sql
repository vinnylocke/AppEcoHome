-- ============================================================
-- CROSS-HOME FAVOURITES — Phase 2 (Watchlist ailments).
--
-- User-scoped saves of watchlist ailments that follow the USER across homes,
-- mirroring Phase 1 (user_favourite_plants). Design decisions in
-- docs/plans/cross-home-favourites.md (2026-07-03 appendices).
--
-- Identity / reference:
--   * ailment_library_id points at the canonical `ailment_library` row (the
--     GLOBAL, immutable catalogue row) when the favourited home ailment can be
--     matched to it. Unlike plants, the home `ailments` row carries NO link
--     column back to `ailment_library`, so the client service resolves the ref
--     by the library's generated `name_key` at favourite time (best-effort).
--     When no library row matches (manual / one-off ailments), the reference is
--     NULL and the favourite renders purely from its snapshot tombstone.
--   * ON DELETE SET NULL: if the library row is ever pruned, the favourite
--     degrades to its tombstone.
--   * NO dedupe machinery beyond the UNIQUE constraints below. Re-favouriting
--     the same ailment upserts (refreshes the tombstone).
--
-- Because a home ailment may have no library row, two rows could otherwise
-- collide on (user_id, NULL). We therefore dedupe on TWO partial uniques:
--   * (user_id, ailment_library_id) WHERE ailment_library_id IS NOT NULL
--     — library-backed favourites are one-per-library-row-per-user.
--   * (user_id, identity_key) WHERE ailment_library_id IS NULL
--     — tombstone favourites dedupe on a lowercased-name key (mirrors the
--     library name_key), so re-favouriting the same manual ailment no-ops.
-- ============================================================

CREATE TABLE public.user_favourite_ailments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Immutable canonical reference (see header). NULL for manual / unmatched
  -- ailments and after the referenced library row is deleted.
  ailment_library_id       bigint REFERENCES public.ailment_library(id) ON DELETE SET NULL,
  -- Tombstone dedupe key for library-less favourites: lowercased trimmed name
  -- (mirrors ailment_library.name_key). Always populated; only enforced UNIQUE
  -- when ailment_library_id IS NULL.
  identity_key             text NOT NULL,
  -- Tombstone columns, captured at favourite time (refreshed on re-favourite).
  -- Live data through ailment_library_id wins whenever it resolves.
  source                   text NOT NULL CHECK (source IN ('manual','perenual','ai','library')),
  name                     text NOT NULL,
  ailment_type             text NOT NULL CHECK (ailment_type IN ('invasive_plant','pest','disease')),
  thumbnail_url            text,
  snapshot                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Informational only — "Saved from <home>" caption.
  favourited_from_home_id  uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_favourite_ailments
  IS 'Cross-home favourites (Phase 2 — watchlist ailments). User-scoped; ailment_library_id is the immutable canonical reference, snapshot is a deletion/no-match tombstone.';
COMMENT ON COLUMN public.user_favourite_ailments.ailment_library_id
  IS 'Canonical ailment_library row (matched by name_key at favourite time). NULL for manual/unmatched ailments. ON DELETE SET NULL -> tombstone render.';
COMMENT ON COLUMN public.user_favourite_ailments.identity_key
  IS 'Lowercased trimmed name (mirrors ailment_library.name_key). Dedupes tombstone favourites (ailment_library_id IS NULL).';
COMMENT ON COLUMN public.user_favourite_ailments.snapshot
  IS 'Tombstone payload (description, symptoms, prevention_steps, remedy_steps, scientific_name, perenual_id). Live library data wins when the reference resolves.';

-- Per-user list read + FK-delete support.
CREATE INDEX user_fav_ailments_user_idx    ON public.user_favourite_ailments (user_id, created_at DESC);
CREATE INDEX user_fav_ailments_library_idx ON public.user_favourite_ailments (ailment_library_id) WHERE ailment_library_id IS NOT NULL;

-- Dedupe: library-backed favourites by library id; tombstones by identity_key.
CREATE UNIQUE INDEX user_fav_ailments_library_uniq
  ON public.user_favourite_ailments (user_id, ailment_library_id)
  WHERE ailment_library_id IS NOT NULL;
CREATE UNIQUE INDEX user_fav_ailments_tombstone_uniq
  ON public.user_favourite_ailments (user_id, identity_key)
  WHERE ailment_library_id IS NULL;

-- ── RLS — pure user-scoped (pattern: guide_bookmarks / user_favourite_plants) ──
ALTER TABLE public.user_favourite_ailments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own favourite ailments" ON public.user_favourite_ailments
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Data API grants (mandatory per CLAUDE.md for all new tables) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favourite_ailments TO authenticated;
-- No anon grants — favourites are always authenticated.

-- ── Server-side source × tier gate ──────────────────────────────────
-- Strict tier gating (2026-07-03 final decisions), mirroring the plants trigger.
-- Ailment sources map onto the same entitlement flags as plants:
--   source 'ai'       -> requires ai_enabled       (Sage / Evergreen)
--   source 'perenual' -> requires enable_perenual  (Botanist / Evergreen)
--   source 'manual' / 'library' -> open to every tier
--     (the seeded ailment_library is the free default search source for every
--      tier — see 20260824000000_ailment_library_source.sql — so 'library' is
--      ungated, exactly like 'manual').
--
-- Unlike plants, the home `ailments` row carries no link to `ailment_library`,
-- so the trigger CANNOT re-derive source from the referenced row (a library row
-- has unrelated source semantics). It therefore gates on the favourite's own
-- claimed `source` — which is the source the user sees on the card and the axis
-- the client lock (isAilmentSourceLockedForTier) uses. A client could in
-- principle understate the source, but the strict gate is a defence-in-depth
-- backstop for the honest client path; the UI never offers an above-tier
-- favourite in the first place.
--
-- Service-role / direct-SQL writes (seeds) have no auth.uid() and are exempt so
-- the tier test accounts can carry above-tier favourites for view-only UI.
CREATE OR REPLACE FUNCTION public.enforce_favourite_ailment_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ai       boolean;
  v_perenual boolean;
  v_source   text;
BEGIN
  -- Exempt service-role / direct SQL (no JWT).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(up.ai_enabled, false), COALESCE(up.enable_perenual, false)
    INTO v_ai, v_perenual
    FROM public.user_profiles up
   WHERE up.uid = NEW.user_id;

  -- Effective source: when the favourite references a canonical library row,
  -- re-derive source from THAT row (unspoofable — mirrors the plants trigger
  -- reading plants.source). Tombstone-only favourites (no library ref) have
  -- no server-side source of truth, so fall back to the client's claim; that
  -- is low-risk because Home-tab ailments are viewable by every tier by
  -- design and the value-generating AI actions stay gated at their own call
  -- sites.
  v_source := NEW.source;
  IF NEW.ailment_library_id IS NOT NULL THEN
    SELECT al.source INTO v_source
      FROM public.ailment_library al
     WHERE al.id = NEW.ailment_library_id;
    v_source := COALESCE(v_source, NEW.source);
  END IF;

  IF v_source = 'ai' AND NOT COALESCE(v_ai, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'AI-sourced ailments require an AI-enabled plan.';
  END IF;
  IF v_source = 'perenual' AND NOT COALESCE(v_perenual, false) THEN
    RAISE EXCEPTION 'tier_locked_source'
      USING HINT = 'Plant-database ailments require a plan with the species database.';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER user_favourite_ailments_tier_gate
BEFORE INSERT OR UPDATE OF source ON public.user_favourite_ailments
FOR EACH ROW EXECUTE FUNCTION public.enforce_favourite_ailment_tier();
