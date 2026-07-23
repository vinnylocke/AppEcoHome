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

Wraps a single `<img>`: on mount it checks the Cache API bucket `rhozly-image-cache` for the exact `src`, fetches + stores the response on a miss (rendering an object URL from the blob), and on fetch failure shows the provided `fallback` string or an inline leaf placeholder. It takes a single `src` + one `fallback` — **not** a `sources={[...]}` array (earlier doc drift, fixed 2026-07-23):

```tsx
<SmartImage src={primary} fallback={placeholder} alt="Tomato" />
```

### AI relevance vetting (`vet: true`)

The chat "show me a plant" gallery calls `plant-image-search` with `{ count: 9, vet: true }`.
On that path the function runs a **single batched Gemini vision call** that scores each
candidate photo 0–1 for how clearly it shows the requested plant (not seeds, produce on a
plate, diagrams, people, or an unrelated plant), and drops any below
`MIN_PLANT_PHOTO_CONFIDENCE` (~0.55, in `_shared/plantImageVet.ts`). It **fails open** — any
fetch/model error returns the unvetted images, so the gallery never empties on a glitch. The
surviving array is cached per normalised query in **`plant_gallery_cache`** (90-day,
server-only — read/written only by the edge function via the service role) so the vision cost
is paid once. The `count:1` thumbnail path is never vetted. The chat also shows an
illustrative-image disclaimer beneath any reply that renders photos.

### `PlantResultThumb` — search-result + hero thumbnails (self-resolving)

`src/components/PlantResultThumb.tsx` is the single place plant **search-result and detail-hero** images resolve. It shows the stored URL when usable; otherwise — or when that URL fails to load — it lazily resolves one **by name** via `plant-image-search` (the `count:1` hot path, server-cached in `plant_image_cache`), then falls back to a leaf / sparkles placeholder.

Why it exists: AI-seeded `plant_library` rows store `image_url` / `thumbnail_url` = **null** (Gemini enrichment has no images), and Perenual free-tier search returns the `upgrade_access` placeholder — so most result rows had no usable stored URL. `PlantResultThumb` fills the gap without backfilling the library (the image cache already persists results cross-user for 90 days).

Helpers in `src/lib/plantThumb.ts`:
- `isUsablePlantImageUrl(url)` — rejects empty values + the Perenual `upgrade_access` placeholder (centralises a filter previously duplicated in `BulkSearchModal` / `PlantSearchModal`).
- `resolvePlantThumbUrl(name)` — calls `plant-image-search` `{ query, count: 1 }`, returns the first usable `thumb_url` or null; module-level promise map dedupes repeat/concurrent lookups in a session.

Used by: `PlantSearch` result rows (every host), the `BulkSearchModal` cart list, `PlantPreview` hero, and the read-only `ManualPlantCreation` hero (so `PlantDetailModal` + `PlantSearchModal` previews get it too).

### `image-proxy` edge function

Rewrites external URLs through Supabase with cache headers + CORS. Used for providers that block hotlinking or lack CORS headers.

### Caching

- Browser cache via cache headers.
- Service worker runtime cache (PWA).
- Image proxy adds long max-age for re-fetches.

### Rejection & per-home image override (2026-07-23)

On surfaces the user OWNS (Shed plant card + detail, Watchlist ailment card + detail) the main image is tappable → **right / wrong**. A **wrong** verdict is a plain client INSERT into `image_rejections` (home-scoped: `home_id`, `subject_kind` = `plant`|`ailment`, `subject_key` = the normalised name / `name_key` the pool is cache-keyed on, `rejected_url`). The image-search edge functions (`plant-image-search`, `ailment-image-search`) read that table via the **service role** filtered by the request `home_id` and exclude those URLs from every future candidate pool — persisting across the 90-day cache TTL. The filter is **per-home and in-memory only**: it must NEVER mutate the cross-user shared caches (`plant_image_cache` / `plant_gallery_cache` / the ailment caches), or one home's reject would change the image for every home. An exhausted pool → the function returns `{ images: [] }` and the UI keeps the current image ("no other photos found").

Because `ailment_library` is global read-only, a home's replacement ailment image is stored in **`ailment_image_overrides`** (home-scoped, bridged to the bigint library id by `name_key` else `identity_key`, carrying `image_credit` for attribution) AND mirrored into the writable `ailments.thumbnail_url` for home watchlist rows. Ailment image resolution order: home `ailments.thumbnail_url` → `ailment_image_overrides` → `ailment_library` image → KindIcon. See [Data Model — Ailments](./06-data-model-ailments.md) and [docs/plans/image-judge-and-replace.md](../../plans/image-judge-and-replace.md).

### Attribution (Wave 22.0002)

Every image now carries an `image_credit` JSON blob captured at ingestion. Shape:

```ts
interface ImageCredit {
  provider: "perenual" | "verdantly" | "wikipedia" | "pixabay"
          | "inaturalist" | "unsplash" | "plantnet" | "ai" | "user" | "unknown";
  license_name?: string | null;
  license_url?: string | null;
  attribution?: string | null;   // verbatim, e.g. "Photo by Jane Doe"
  source_url?: string | null;
  commercial_ok?: boolean | null;
}
```

Stored as `image_credit jsonb` on `plants`, `inventory_items`, `plant_journals`. The unified shape also rides in `plant-image-search`'s response (`image_credit` per image) and Verdantly / Perenual mapped responses.

Surfaced via `<ImageCredit credit={…} variant="overlay" | "inline" | "badge-only" />` and the `<CreditedImage>` wrapper. Tapping any badge opens `<CreditPopover>` — provider, attribution, licence link, source link, and a footer link to `/credits`. Backfill for existing rows is deferred to Wave 22.0004; in the meantime the badge dims and points to `/credits`.

**`/credits` is now the broader "Credits & Sources" page** (2026-06): it lists *every* external source Rhozly uses — plant data (Perenual, Verdantly), the plant-library reference sources (GBIF, Wikidata, Wikipedia, iNaturalist), plant ID (Pl@ntNet), weather (Open-Meteo + air quality), images, AI (Gemini, Imagen) and infrastructure (Supabase, Firebase, Resend, Stripe) — grouped by category with what each provides, the user-facing surfaces where it's used, and licence links. The data lives in `src/constants/dataSources.ts` (`DATA_SOURCES`); `CreditsPage.tsx` renders the grouped sections. Reached from the profile dropdown ("Credits & sources") + every image credit popover.

**Wave 22.0004 — backfill + remaining hero surfaces:**
- One-off SQL migration `20260710000000_image_credits_backfill.sql` populates:
  - `plants.image_credit` from `species_cache.raw_data.default_image` (Perenual licence + original URL). Zero new API calls — uses the raw payload we already cache.
  - `inventory_items.image_credit` from the related plant's credit (instance heroes inherit catalogue photos).
  - `plant_journals.image_credit` to `{ provider: "user" }` for rows whose `image_url` points at our own storage buckets.
  - Each UPDATE is guarded on `image_credit IS NULL` and safe to re-run.
- `ManualPlantCreation` — passes `initialData.image_credit` into the read-only hero `PlantResultThumb`, so the plant detail modal hero now carries the badge.
- `InstanceEditModal` — pinned cover photo now carries a "Your photo" badge anchored top-right.

**Wave 22.0003 — live surface integrations:**
- `PlantResultThumb` — badge-only overlay whenever the caller passes a `credit` prop. Cascades to every search-result row and tile that uses this component.
- `MultiImageGallery` strip thumbnails — badge-only overlay sourced from each `plant-image-search` result's `image_credit`.
- `PlantDoctor` candidate tiles — inline credit line under both Pl@ntNet and Rhozly AI suggestions. Lets users tell at a glance which identifications are LLM-derived vs curated photo records.
- `plant-doctor` edge fn — emits `image_credit` on each `possible_names` entry (Pl@ntNet → CC-BY-SA) and each `ai_alternatives` entry (Rhozly AI → "AI-generated identification").

Capture pipeline:
- **Perenual** — `default_image.license_name` / `license_url` / `original_url` flow through `perenualService.buildPerenualImageCredit`.
- **Verdantly** — no per-image licence in the API; we credit the platform per ToS.
- **plant-image-search** — Unsplash / Pixabay / Wikipedia normalised to the unified shape.

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
- `src/components/PlantResultThumb.tsx` — self-resolving result/hero thumbnail
- `src/lib/plantThumb.ts` — `isUsablePlantImageUrl` + `resolvePlantThumbUrl`
- `src/lib/wikipedia.ts`
