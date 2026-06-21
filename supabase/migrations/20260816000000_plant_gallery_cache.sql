-- Shared cross-user cache for the AI-vetted plant photo gallery.
--
-- When the chat asks to SEE a plant, plant-image-search now runs each candidate
-- photo through a Gemini vision pass that scores how clearly it shows the plant,
-- and drops low-confidence ones. That vetting costs a model call, so the vetted
-- gallery (the surviving images, with attribution) is cached per normalised
-- query for 90 days — the first user to ask pays; everyone after gets a DB hit.
--
-- Separate from `plant_image_cache` (which stores only the single result-list
-- thumbnail) because this stores the full vetted array and is written only on
-- the `vet: true` path.
--
-- Server-only: read + written exclusively by the plant-image-search edge
-- function via the service role. The browser never queries it directly (it
-- calls the function), so there are no anon/authenticated grants — RLS with no
-- policies denies clients, and the service role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.plant_gallery_cache (
  query_normalised text PRIMARY KEY,
  images           jsonb NOT NULL,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

COMMENT ON TABLE public.plant_gallery_cache IS
  'Server-only cache of the AI-relevance-vetted plant photo gallery from plant-image-search (vet:true path). 90-day TTL, keyed by normalised query.';

ALTER TABLE public.plant_gallery_cache ENABLE ROW LEVEL SECURITY;

-- The edge function uses the service-role client; grant it explicitly so access
-- is guaranteed regardless of default-privilege changes. No anon/authenticated
-- grants — this table is never read from the browser.
GRANT ALL ON TABLE public.plant_gallery_cache TO service_role;
