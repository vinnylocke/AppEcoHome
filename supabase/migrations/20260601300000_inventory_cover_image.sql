-- ============================================================
-- PER-INSTANCE COVER IMAGE (Phase 2 Wave 2 Pass 3)
-- Lets users pin a specific photo from their Photo Timeline as
-- the cover image for that plant instance — overriding the
-- species default art shown in The Shed, etc.
-- ============================================================

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.inventory_items.cover_image_url IS
  'Optional override image for this specific plant instance — chosen by the user from their photo timeline. Falls back to the species default when null.';
