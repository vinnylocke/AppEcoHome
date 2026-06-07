-- ─── Wave 22.0002 — Image licence + attribution metadata ────────────────
--
-- Adds a single `image_credit jsonb` column to every table that already
-- holds an `image_url` / `thumbnail_url` pair. Stores the unified shape:
--
--   {
--     provider:       text (e.g. "perenual" | "verdantly" | "wikipedia"
--                     | "pixabay" | "inaturalist" | "unsplash"
--                     | "plantnet" | "ai" | "user" | "unknown"),
--     license_name?:  text,
--     license_url?:   text,
--     attribution?:   text,
--     source_url?:    text,
--     commercial_ok?: boolean
--   }
--
-- All existing rows default to NULL — read sites treat null as
-- `{ provider: "unknown" }` and fall back to the `/credits` umbrella
-- attribution page. Backfill happens in Wave 22.0004.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS image_credit jsonb;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS image_credit jsonb;

ALTER TABLE public.plant_journals
  ADD COLUMN IF NOT EXISTS image_credit jsonb;

COMMENT ON COLUMN public.plants.image_credit IS
  'Wave 22.0002 — licence / attribution metadata for image_url / thumbnail_url. Provider, licence name + URL, attribution string, source URL. NULL = unknown source (falls back to /credits umbrella).';

COMMENT ON COLUMN public.inventory_items.image_credit IS
  'Wave 22.0002 — same shape as plants.image_credit, applied when the user picks a provider photo as the instance hero.';

COMMENT ON COLUMN public.plant_journals.image_credit IS
  'Wave 22.0002 — typically `{ provider: "user" }` because journal photos are user uploads. Backfilled to that default in Wave 22.0004.';
