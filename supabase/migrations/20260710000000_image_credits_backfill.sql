-- ─── Wave 22.0004 — backfill image_credit for existing rows ─────────────
--
-- Three idempotent UPDATEs. Each is guarded on `image_credit IS NULL`
-- so re-running on prod is a no-op for rows that already have credit.
--
-- 1. plants ← species_cache.raw_data.default_image
--    Every Perenual plant we've ever rendered already has its licence
--    info sitting in species_cache (we cache the raw payload). JOIN +
--    jsonb extract = full backfill with no new API calls.
--
-- 2. inventory_items ← plants.image_credit (via plant_id)
--    User instances usually display the catalogue plant's hero photo;
--    copy the credit so the tile-side badge isn't blank.
--
-- 3. plant_journals ← user upload (when URL points at our buckets)
--    Mark journal photos hosted on our own storage as "Your photo".

-- 1) Perenual catalogue rows ----------------------------------------------

UPDATE public.plants p
SET image_credit = jsonb_strip_nulls(jsonb_build_object(
  'provider',     'perenual',
  'license_name', sc.raw_data->'default_image'->>'license_name',
  'license_url',  COALESCE(
                    sc.raw_data->'default_image'->>'license_url',
                    'https://perenual.com/docs/api'
                  ),
  'attribution',  NULL,
  'source_url',   COALESCE(
                    sc.raw_data->'default_image'->>'original_url',
                    'https://perenual.com/plant/' || p.id::text
                  )
))
FROM public.species_cache sc
WHERE p.id = sc.id
  AND p.image_url IS NOT NULL
  AND p.image_credit IS NULL
  AND sc.raw_data ? 'default_image';

-- 2) Inventory rows that inherit a plant's hero photo --------------------

UPDATE public.inventory_items i
SET image_credit = p.image_credit
FROM public.plants p
WHERE i.plant_id = p.id
  AND i.image_credit IS NULL
  AND p.image_credit IS NOT NULL;

-- 3) Plant journals — user uploads detected by URL pattern --------------

UPDATE public.plant_journals
SET image_credit = jsonb_build_object('provider', 'user')
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND (
    image_url LIKE '%/storage/v1/object/public/plant-images/%'
    OR image_url LIKE '%/storage/v1/object/public/journal-photos/%'
  );
