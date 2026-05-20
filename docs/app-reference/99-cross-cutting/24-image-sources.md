# Image Sources — Perenual, Verdantly, Wikipedia, Pixabay, Unsplash

> Rhozly pulls reference imagery from multiple providers. Each has its own licensing, latency, and quality profile. The `plant-image-search` edge function merges results across providers; specific UI surfaces may filter to one.

---

## Quick Summary

| Provider | Licensing | Best for | Used in |
|----------|-----------|----------|---------|
| Perenual | Provider-licensed | Plant database thumbnails | BulkSearch, PlantInfoPanel |
| Verdantly | Provider-licensed | Curated database imagery | BulkSearch, PlantInfoPanel |
| Wikipedia / Commons | CC-BY / CC0 | Reference photos | WikiImagePicker, Multi/Diagnosis galleries |
| Pixabay | CC0 (most) | Stock plant photos | Sprite Wizard, galleries |
| iNaturalist | CC-BY-NC (varies) | Community photos with confirmed IDs | Sprite Wizard, galleries |
| Unsplash | Unsplash license | Fallback / hero imagery | SmartImage fallback |

---

## Role 1 — Technical Reference

### `plant-image-search` edge function

Single entry point for "get me images for query X". Merges sources, returns up to N normalised results:

```ts
{
  id, thumb_url, full_url, alt,
  source: "perenual" | "verdantly" | "wikipedia" | "pixabay" | "inaturalist" | "unsplash",
}
```

### `SmartImage` component

Tries multiple URLs in order; falls back to placeholder on all-fail:

```ts
<SmartImage
  sources={[primary, secondary, fallback]}
  alt="Tomato"
/>
```

### `image-proxy` edge function

Rewrites external URLs through Supabase with cache headers + CORS. Used for providers that block hotlinking or lack CORS headers.

### Caching

- Browser cache via cache headers.
- Service worker runtime cache (PWA).
- Image proxy adds long max-age for re-fetches.

### Attribution

Per-provider attribution displayed in galleries (e.g. "via Wikipedia") to honour CC-BY.

### Sprite Wizard

Uses 5 sources as tabs: Pixabay, Perenual, Wikipedia, iNaturalist, Personal (user upload). Background removal via `@imgly/background-removal`.

### Diagnosis / Multi galleries

Use `plant-image-search` merged results.

---

## Role 2 — Expert Gardener's Guide

### Why multiple providers

Different providers have different strengths:
- Perenual / Verdantly know cultivars.
- Wikipedia has botanical accuracy.
- Pixabay / Unsplash have visual variety.
- iNaturalist has expert-confirmed identifications.

### Implications

- Different sources may show different cultivars under the same name.
- Some images may break if a provider URL changes.

---

## Related reference files

- [Plant Providers](./25-plant-providers.md)
- [Sprite Wizard](../05-tools/06-sprite-wizard.md)
- [Multi Image Gallery](../08-modals-and-overlays/29-multi-image-gallery.md)
- [Diagnosis Image Gallery](../08-modals-and-overlays/30-diagnosis-gallery.md)
- [Wiki Image Picker](../08-modals-and-overlays/34-wiki-image-picker.md)

## Code references for ongoing maintenance

- `supabase/functions/plant-image-search/index.ts`
- `supabase/functions/image-proxy/index.ts`
- `src/components/SmartImage.tsx`
- `src/lib/wikipedia.ts`
