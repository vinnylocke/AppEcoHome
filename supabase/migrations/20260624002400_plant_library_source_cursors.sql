-- Plant Library — per-source pagination cursors
--
-- Sequential pagination lets the seeder walk through each
-- source's catalogue exactly once instead of random-sampling with
-- diminishing returns. At ~10k+ DB size, random sampling from
-- popular plant sources returns the same head-of-distribution
-- plants over and over; sequential pagination guarantees every
-- page is fresh until the source is exhausted.
--
-- Cursor shape is per-source jsonb so we can encode different
-- pagination models cleanly:
--   perenual:  { "page": 1 }      — sequential 1..total_pages
--   verdantly: { "letter": "a", "page": 1 } — walk a→z, pages within
--   wikidata:  { "offset": 0 }    — sequential 0..50000 step 500
--   gbif:      { "offset": 0 }    — sequential 0..99999 step 100
--
-- Wikipedia + iNat stay random (Wikipedia categories overlap too
-- much for sequential traversal; iNat's popularity sort is useful
-- for common-plant fill-ins).

CREATE TABLE IF NOT EXISTS public.plant_library_source_cursors (
  source       text PRIMARY KEY,
  cursor       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'exhausted')),
  total_pages  integer,
  exhausted_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plant_library_source_cursors IS
  'Per-source pagination cursors for the plant_library seeder. Lets cursor-based sources (Perenual / Verdantly / Wikidata / GBIF) walk their catalogues sequentially across multiple submits, advancing the cursor each fetch. Random-sampling sources (Wikipedia / iNat) don''t have rows here.';
COMMENT ON COLUMN public.plant_library_source_cursors.cursor IS
  'Source-specific JSON: perenual={page}, verdantly={letter,page}, wikidata={offset}, gbif={offset}.';
COMMENT ON COLUMN public.plant_library_source_cursors.status IS
  '"active" = still has more pages to walk; "exhausted" = full catalogue consumed (won''t be hit again until admin resets).';

-- Seed initial rows for each cursor-driven source.
INSERT INTO public.plant_library_source_cursors (source, cursor) VALUES
  ('perenual',  '{"page": 1}'::jsonb),
  ('verdantly', '{"letter": "a", "page": 1}'::jsonb),
  ('wikidata',  '{"offset": 0}'::jsonb),
  ('gbif',      '{"offset": 0}'::jsonb)
ON CONFLICT (source) DO NOTHING;

-- Admin-only RLS — mirrors plant_library_run_schedules.
ALTER TABLE public.plant_library_source_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_library_source_cursors admin read" ON public.plant_library_source_cursors;
CREATE POLICY "plant_library_source_cursors admin read"
  ON public.plant_library_source_cursors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

DROP POLICY IF EXISTS "plant_library_source_cursors admin update" ON public.plant_library_source_cursors;
CREATE POLICY "plant_library_source_cursors admin update"
  ON public.plant_library_source_cursors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );
