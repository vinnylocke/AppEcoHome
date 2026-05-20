# Multi Image Gallery

> A reference-image gallery that fetches up to 9 photos for a search query via the `plant-image-search` edge function. Used inside Plant Search Modal and other "what does this plant look like?" surfaces.

**Source file:** `src/components/MultiImageGallery.tsx`

---

## Quick Summary

Given a search query (e.g. "tomato Brandywine") plus optionally a "stored" image already attached to the plant, this surfaces 9 images from various sources (Wikipedia, Pixabay, iNaturalist) inside a `Lightbox` for browsing.

---

## Role 1 — Technical Reference

### Component graph

```
MultiImageGallery
└── GalleryModal (when triggered)
    ├── Stored image (if attached)
    ├── Fetched images (up to 9)
    └── Lightbox (carousel)
```

### `GalleryImage` shape (from DiagnosisImageGallery)

```ts
{
  id, thumb_url, full_url, alt,
  source: "stored" | "wikipedia" | "pixabay" | "inaturalist" | "verdantly" | "perenual" | "unsplash",
}
```

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `plant-image-search` | Returns merged image array from multiple providers |

### Data flow

- Open → if stored image present, opens lightbox on it immediately.
- Async fetch → merges fetched into the array.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — image search is free.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Loading stops; only stored remains |
| No stored + no results | Empty state |

### Performance

- Lazy on open.
- Image lazy-loading via browser.

### Linked storage buckets

None directly.

---

## Role 2 — Expert Gardener's Guide

### Why use this gallery

When you're not 100% sure what variety of a plant you have, pull up reference photos from across the web. Compare side-by-side via Lightbox.

### Every flow

#### 1. Open the gallery

- Tap a chevron / "View images" button on a parent flow.

#### 2. Browse

- Lightbox swipe / arrow.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Cultivar drift.** "Tomato" returns many cultivars; refine search.

### Recommended workflows

- **Identify pre-purchase:** browse images for the variety you're considering.

### What to do if something looks wrong

- **No images:** the search service may be down. Retry.

---

## Related reference files

- [Plant Search Modal](./05-plant-search-modal.md)
- [Diagnosis Image Gallery](./30-diagnosis-gallery.md)

## Code references for ongoing maintenance

- `src/components/MultiImageGallery.tsx`
- `src/components/DiagnosisImageGallery.tsx` (shares Lightbox)
- `supabase/functions/plant-image-search/index.ts`
