-- ============================================================
-- AILMENT IMAGE CACHES — server-only, for the ailment-image-search fn
--
-- Feature: image tap → right/wrong → replace, ailment side
-- (docs/plans/image-judge-and-replace.md, 2026-07-23).
--
-- Mirrors plant_image_cache / plant_gallery_cache but for ailments (pests /
-- diseases / invasives). Keyed by the normalised ailment name. BOTH are
-- service-role-only: the ailment-image-search edge function is the sole
-- reader/writer — ailments render from ailments.thumbnail_url / the per-home
-- ailment_image_overrides / ailment_library, never a client-side count:1
-- resolve — so RLS with no client policies denies clients and the service role
-- bypasses RLS. No authenticated/anon grants (not client-exposed).
-- ============================================================

-- The count:1 "winning image" cache (hot path).
CREATE TABLE IF NOT EXISTS public.ailment_image_cache (
  query_normalised text PRIMARY KEY,
  thumb_url        text NOT NULL,
  full_url         text NOT NULL,
  source           text NOT NULL,
  attribution      jsonb,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

ALTER TABLE public.ailment_image_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ailment_image_cache TO service_role;

-- The vetted count:N gallery cache (avoids re-paying the Gemini vet).
CREATE TABLE IF NOT EXISTS public.ailment_gallery_cache (
  query_normalised text PRIMARY KEY,
  images           jsonb NOT NULL,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

ALTER TABLE public.ailment_gallery_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ailment_gallery_cache TO service_role;
