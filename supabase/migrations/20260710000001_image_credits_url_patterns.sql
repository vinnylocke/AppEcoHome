-- ─── Wave 22.0004 (follow-up) — URL-pattern inference for image_credit ──
--
-- The species_cache-based backfill only reached Perenual plants whose
-- raw payload we'd cached. Other rows with an `image_url` (Wikipedia,
-- Pl@ntNet, Unsplash, Pixabay) we can credit from the URL host itself.
-- Idempotent — only updates rows where image_credit IS NULL.

-- Wikimedia Commons -------------------------------------------------------

UPDATE public.plants
SET image_credit = jsonb_build_object(
  'provider',     'wikipedia',
  'license_name', NULL,
  'license_url',  'https://creativecommons.org/licenses/',
  'attribution',  NULL,
  'source_url',   image_url
)
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND image_url LIKE '%upload.wikimedia.org%';

-- Unsplash ----------------------------------------------------------------

UPDATE public.plants
SET image_credit = jsonb_build_object(
  'provider',     'unsplash',
  'license_name', 'Unsplash License',
  'license_url',  'https://unsplash.com/license',
  'attribution',  NULL,
  'source_url',   image_url
)
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND image_url LIKE '%images.unsplash.com%';

-- Pixabay -----------------------------------------------------------------

UPDATE public.plants
SET image_credit = jsonb_build_object(
  'provider',     'pixabay',
  'license_name', 'Pixabay Content License',
  'license_url',  'https://pixabay.com/service/license-summary/',
  'attribution',  NULL,
  'source_url',   image_url
)
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND image_url LIKE '%cdn.pixabay.com%';

-- Perenual CDN (rows that bypassed species_cache for some reason) ---------

UPDATE public.plants
SET image_credit = jsonb_build_object(
  'provider',     'perenual',
  'license_name', NULL,
  'license_url',  'https://perenual.com/docs/api',
  'attribution',  NULL,
  'source_url',   'https://perenual.com/plant/' || id::text
)
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND image_url LIKE '%perenual.com%';

-- Inventory items inherit anything we just learned ------------------------

UPDATE public.inventory_items i
SET image_credit = p.image_credit
FROM public.plants p
WHERE i.plant_id = p.id
  AND i.image_credit IS NULL
  AND p.image_credit IS NOT NULL;
