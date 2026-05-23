-- Plant Library — searchable text column
--
-- Generated column concatenating common_name + scientific_name (as text)
-- so a single ILIKE in PostgREST can match either field without
-- needing client-side OR queries or RPC functions.
--
-- No index for V1 — at a few thousand rows the sequential scan is
-- fast enough. Add a GIN trigram index (`gin_trgm_ops`) when the
-- table crosses ~50k rows and the ILIKE starts to feel slow.

ALTER TABLE public.plant_library
  ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
    lower(common_name || ' ' || COALESCE(scientific_name::text, ''))
  ) STORED;

COMMENT ON COLUMN public.plant_library.search_text IS
  'Lowercased common_name + JSON-stringified scientific_name. Single ILIKE matches either field. Generated, immutable per row.';
