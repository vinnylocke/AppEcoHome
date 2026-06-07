# Plan — 22.0004: backfill existing image credits + long-tail surfaces

Wave C of the image licensing rollout. Closes the loop on existing data — populates `image_credit` for rows that pre-date 22.0002 — and wires the badge into the remaining hero surfaces.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) — credit shape + Wave A / B integrations
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants` + `inventory_items` + `species_cache`
- [`docs/app-reference/99-cross-cutting/07-data-model-media.md`](../app-reference/99-cross-cutting/07-data-model-media.md) — `plant-images` + `journal-photos` buckets

## Backfill strategy (SQL migration)

Three idempotent UPDATEs. All gated on `image_credit IS NULL` so they're safe to re-run.

### 1. `plants` from `species_cache.raw_data.default_image`

`species_cache` is the Perenual raw payload cache — we cached the `default_image` object back when 22.0002 wasn't a thing yet, so every Perenual row Rhozly has ever rendered already has its licence info sitting in that table. JOIN + jsonb extract = full backfill with no new API calls.

```sql
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
```

### 2. `inventory_items` inherits from `plants`

User instances usually display the catalogue plant's hero photo. Copy the credit so a tile-side badge isn't blank.

```sql
UPDATE public.inventory_items i
SET image_credit = p.image_credit
FROM public.plants p
WHERE i.plant_id = p.id
  AND i.image_credit IS NULL
  AND p.image_credit IS NOT NULL;
```

### 3. `plant_journals` for user-uploaded photos

Any journal photo whose URL points at our own Supabase storage is a user upload. Mark it explicitly so the badge reads "Your photo" instead of "Unknown source".

```sql
UPDATE public.plant_journals
SET image_credit = jsonb_build_object('provider', 'user')
WHERE image_credit IS NULL
  AND image_url IS NOT NULL
  AND (
    image_url LIKE '%/storage/v1/object/public/plant-images/%'
    OR image_url LIKE '%/storage/v1/object/public/journal-photos/%'
  );
```

## Long-tail surface wiring

Two more hero surfaces get the badge so the "tap the badge anywhere" promise holds across the app:

| Surface | Variant | Source of credit |
|---------|---------|------------------|
| [`PlantPreview`](../../src/components/PlantPreview.tsx) hero | `overlay` | `plant.image_credit` from the loaded catalogue row |
| [`InstanceEditModal`](../../src/components/InstanceEditModal.tsx) hero | `overlay` | `instance.image_credit` (falls back to the related plant's via JOIN) |

Both are large enough that the overlay badge sits naturally bottom-right without crowding any chips or controls.

## Files modified

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_image_credits_backfill.sql` | NEW — three idempotent UPDATEs |
| [`src/components/PlantPreview.tsx`](../../src/components/PlantPreview.tsx) | Overlay credit on the hero image |
| [`src/components/InstanceEditModal.tsx`](../../src/components/InstanceEditModal.tsx) | Overlay credit on the plant hero |
| [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) | Note backfill + final hero surfaces |

## Tests

Visual / e2e only. The migration is idempotent so re-running it on prod is safe.

## Deploy

- DB push (one migration)
- Vercel frontend deploy
- Minor bump → **22.0004**
- No edge function changes

## Risks

- **Backfill scope** is bounded by `species_cache` rows. Plants without a cached Perenual payload (e.g. AI-only rows) stay null and continue to fall back to `/credits` — that's by design.
- **Verdantly rows** are not retroactively backfilled here (we don't cache Verdantly raw payloads in `species_cache`). They'll pick up credit on the next refresh per the 22.0002 capture pipeline.
- **Idempotent**: each UPDATE has `image_credit IS NULL` as a guard, so re-running is a no-op.
- **Storage URL pattern** for plant-journals: the LIKE expressions catch our two image buckets. Misses any custom hosting (none today) — those stay null and fall back to /credits gracefully.
