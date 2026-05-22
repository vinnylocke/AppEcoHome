-- Shared cross-user cache for plant thumbnail lookups.
--
-- Today every call to `plant-image-search` re-hits Unsplash / Pixabay /
-- Wikipedia. With this table the first user to search a given plant
-- name pays the external-API cost; every subsequent user gets a DB hit
-- in <50ms instead. 90-day TTL — plants don't change much, but the
-- image hosts occasionally rotate URLs, so we re-fetch periodically.
--
-- Only the FIRST returned image is cached (i.e. the thumbnail used in
-- result lists). The multi-image gallery picker re-fetches the full
-- provider response on demand — its volume is much lower so the cost
-- of caching arrays isn't worth the schema complexity.

CREATE TABLE IF NOT EXISTS public.plant_image_cache (
  query_normalised text PRIMARY KEY,
  thumb_url        text NOT NULL,
  full_url         text NOT NULL,
  source           text NOT NULL CHECK (source IN ('unsplash', 'pixabay', 'wikipedia')),
  attribution      jsonb,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

COMMENT ON TABLE  public.plant_image_cache IS
  'Shared cross-user cache for the first thumbnail returned by plant-image-search. Read-through, 90-day TTL.';
COMMENT ON COLUMN public.plant_image_cache.query_normalised IS
  'Lowercased + trimmed plant name. Single global key — not scoped per home or user.';
COMMENT ON COLUMN public.plant_image_cache.attribution IS
  'License-aware metadata so credit-bearing components can render attribution without a second lookup. Shape depends on source.';

-- Authenticated users can read the cache (no PII).
ALTER TABLE public.plant_image_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_image_cache select" ON public.plant_image_cache;
CREATE POLICY "plant_image_cache select"
  ON public.plant_image_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role writes (the edge fn uses the service-role client).
-- Authenticated insert is also allowed (cheap upsert path from the
-- function when running in JWT mode); the row is the same global
-- truth either way.
DROP POLICY IF EXISTS "plant_image_cache insert" ON public.plant_image_cache;
CREATE POLICY "plant_image_cache insert"
  ON public.plant_image_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "plant_image_cache update" ON public.plant_image_cache;
CREATE POLICY "plant_image_cache update"
  ON public.plant_image_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
