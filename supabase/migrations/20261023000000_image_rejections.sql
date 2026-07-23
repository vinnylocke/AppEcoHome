-- ============================================================
-- IMAGE REJECTIONS — "this image is wrong for this subject in this home"
--
-- Feature: image tap → right/wrong → remove & replace
-- (docs/plans/image-judge-and-replace.md, 2026-07-23).
--
-- Home-scoped, persistent record that a specific image URL was judged WRONG for
-- a given plant or ailment in this home. The image-search edge functions read
-- this table (via the service role, filtered by the request's home_id) and
-- exclude these URLs from every future candidate pool — so a rejected image is
-- never re-shown for that home, even after the shared image caches' 90-day TTL
-- refetches it.
--
-- The "reject" itself is a plain client INSERT (no new edge-function verb). The
-- "serve the next candidate" half lives in plant-image-search /
-- ailment-image-search becoming rejection-aware. Filtering stays PER-HOME and
-- in-memory in the edge function — it must NEVER mutate the cross-user shared
-- caches, or one home's reject would change the image for every home.
-- ============================================================

CREATE TABLE public.image_rejections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  subject_kind  text NOT NULL CHECK (subject_kind IN ('plant','ailment')),
  -- The NORMALISED key the image pool is cache-keyed on: normaliseQuery(name)
  -- for plants, ailment name_key for ailments. Scopes a rejection to the whole
  -- species/organism in this home (matching how the caches key), not one row.
  subject_key   text NOT NULL,
  -- The exact URL on display when rejected (both thumb + full compared at filter time).
  rejected_url  text NOT NULL,
  -- Optional audit pointer to the concrete plants.id / ailments.id on screen.
  -- Loose text (not an FK): plants PK is integer, ailments PK is uuid.
  subject_id    text,
  rejected_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.image_rejections IS
  'Home-scoped "this image is wrong for this subject" records. Excluded from every future image-search candidate pool for the home (persists across the 90-day cache TTL). Written as a plain client INSERT; read by plant-image-search / ailment-image-search via the service role. Never mutates the shared caches.';

-- Idempotent re-reject (client upserts on-conflict-do-nothing).
CREATE UNIQUE INDEX image_rejections_dedup
  ON public.image_rejections (home_id, subject_kind, subject_key, rejected_url);
-- The edge-function filter: per-home, per-subject lookup.
CREATE INDEX image_rejections_lookup
  ON public.image_rejections (home_id, subject_kind, subject_key);
-- Future "rejected by N homes" aggregation / admin viewer (deferred — Open Q7).
CREATE INDEX image_rejections_agg
  ON public.image_rejections (subject_kind, subject_key, rejected_url);

ALTER TABLE public.image_rejections ENABLE ROW LEVEL SECURITY;

-- Canonical home-scoped policy — members of the home only. Rejections are
-- immutable (no UPDATE grant below); DELETE enables "undo reject".
CREATE POLICY "home image rejections" ON public.image_rejections
  FOR ALL TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())));

-- Data API grants (mandatory per CLAUDE.md for all new tables). No UPDATE
-- (immutable); no anon grant (always authenticated). The edge functions read
-- via the service role, which bypasses RLS.
GRANT SELECT, INSERT, DELETE ON TABLE public.image_rejections TO authenticated;
