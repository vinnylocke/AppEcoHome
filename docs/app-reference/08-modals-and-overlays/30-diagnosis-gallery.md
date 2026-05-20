# Diagnosis Image Gallery

> The reference-image strip shown inside Plant Doctor after identification or diagnosis. Pulls images from Perenual / Verdantly / Wikipedia / iNaturalist / Pixabay so the user can confirm the AI's guess against real photos.

**Source file:** `src/components/DiagnosisImageGallery.tsx`

---

## Quick Summary

After a Plant Doctor result, this strip renders thumbnails for the top candidate. Tap one → Lightbox shows full-size with source attribution. Helps the user verify the AI's identification by visual comparison.

---

## Role 1 — Technical Reference

### Component graph

```
DiagnosisImageGallery
├── Thumbnail strip
│   └── Image tile (per result)
└── Lightbox (per-tile open)
    ├── Full image
    ├── Source chip
    └── Navigation
```

### `GalleryImage` shape

```ts
{
  id, thumb_url, full_url, alt,
  source: "wikipedia" | "pixabay" | "inaturalist" | "verdantly" | "perenual" | "unsplash" | "stored",
}
```

### Props (typical)

| Prop | Type | Purpose |
|------|------|---------|
| `query` | `string` | Plant name to search |
| `existingImageUrl` | `string?` | Stored image attached to the plant |

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `plant-image-search` | Merged image search |

### Data flow

- On mount, fetches images.
- Stored image (if any) shown first; fetched images follow.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Empty | Strip hidden |
| Source unavailable | Source chip omitted |

### Performance

- Lazy image load.
- Lightbox lazy mount.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this gallery

To sanity-check the AI. "It says my plant is a basil — does it actually look like a basil?" Browse reference photos and confirm.

### Every flow

#### 1. Browse strip

- Horizontal strip below the diagnosis result.

#### 2. Open lightbox

- Tap any thumbnail → full image + source.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Comparing leaf images to your fruit.** Match the stage of growth.
- **Trusting one source.** Different sources may show different cultivars — browse a few.

### Recommended workflows

- **Always after AI identification.** Two seconds to confirm; saves planting the wrong species.

### What to do if something looks wrong

- **Strip empty:** plant-image-search returned nothing.

---

## Related reference files

- [Plant Doctor](../05-tools/02-plant-doctor.md)
- [Multi Image Gallery](./29-multi-image-gallery.md)

## Code references for ongoing maintenance

- `src/components/DiagnosisImageGallery.tsx`
- `supabase/functions/plant-image-search/index.ts`
