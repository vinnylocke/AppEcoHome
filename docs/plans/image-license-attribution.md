# Plan — Image license + attribution, surfaced everywhere images appear

User: "For Perenual (and Verdantly, and in general whenever we get images) I want to include the license information and make this visible to the user. I want this to be compliant. Perenual returns license info in the JSON object. This will need to be a big change — it'll need to apply whenever we use any images."

## What "compliant" means in this codebase

Most of our image providers require, at minimum, **attribution** when the image is displayed publicly. Some also require a **link to the source / photo page** and a **link to the licence terms**. Today we capture *some* of this for the gallery providers (Unsplash photographer + URL, Pixabay/Wiki links), but:

- **Perenual** — its `default_image` object exposes `license`, `license_name`, `license_url` and `original_url`. We currently throw all four away ([`perenualService.ts:163-164`](../../src/lib/perenualService.ts#L163-L164) only keeps `regular_url` + `thumbnail`).
- **Verdantly** — its v2 response only returns a bare `imageUrl`; the RapidAPI listing says the service is "Verdantly Gardening API". Per Verdantly's Terms of Service we must attribute Verdantly when we show their image. We currently capture nothing.
- **Wikipedia / Commons** — `extmetadata` has `LicenseShortName`, `LicenseUrl`, `Artist`. We only keep `wiki_page` today.
- **Pixabay**, **iNaturalist**, **Unsplash** — partial attribution captured by `plant-image-search` already (Unsplash is the strongest); needs to be normalised.
- **AI-generated** (Gemini / Imagen) — no licence; needs a clear "AI-generated" provenance label so users know it's not a real photo.
- **User-uploaded** — user-owned. Display "Your photo" so the chrome stays consistent.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) — current provider table + attribution note
- [`docs/app-reference/99-cross-cutting/25-plant-providers.md`](../app-reference/99-cross-cutting/25-plant-providers.md) — provider-by-provider contracts
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants.image_url` / `thumbnail_url` columns
- [`docs/app-reference/99-cross-cutting/07-data-model-media.md`](../app-reference/99-cross-cutting/07-data-model-media.md) — storage buckets + journal photos
- [`docs/app-reference/05-tools/06-sprite-wizard.md`](../app-reference/05-tools/06-sprite-wizard.md) — Pixabay / Perenual / Wikipedia / iNaturalist tabs
- [`docs/app-reference/08-modals-and-overlays/29-multi-image-gallery.md`](../app-reference/08-modals-and-overlays/29-multi-image-gallery.md), [`30-diagnosis-gallery.md`](../app-reference/08-modals-and-overlays/30-diagnosis-gallery.md), [`34-wiki-image-picker.md`](../app-reference/08-modals-and-overlays/34-wiki-image-picker.md) — gallery surfaces

## Strategy in one paragraph

Capture licence + attribution at every ingestion point (edge functions). Store it as a single normalised jsonb column `image_credit` on every row that holds an image URL. Build one reusable `<ImageCredit>` component that renders a tiny "ⓘ" button overlay on every image; tap to reveal a popover with provider, attribution, licence name and links. Replace `SmartImage` callsites surface-by-surface with `<CreditedImage>` (a thin wrapper that takes the credit JSON alongside the URL). Plus a global `/credits` page that summarises every provider we use, linked from the About menu — required by some providers (Pixabay, Unsplash) and a clean fallback when an individual image is missing credit metadata.

## Data shape

One JSON shape, everywhere:

```ts
interface ImageCredit {
  /** Stable provider id — drives the badge + fallback "via Perenual" labels. */
  provider: "perenual" | "verdantly" | "wikipedia" | "pixabay"
          | "inaturalist" | "unsplash" | "ai" | "user" | "unknown";
  /** Short human-readable licence name, e.g. "CC-BY-SA 4.0", "Public Domain",
   *  "Unsplash License", "Pixabay Content License", "AI-generated". */
  license_name?: string | null;
  /** URL to the canonical licence terms. */
  license_url?: string | null;
  /** Free text shown verbatim alongside the image when present (e.g.
   *  "Photo by Jane Doe"). For Unsplash this is the photographer's name. */
  attribution?: string | null;
  /** Link to the source page (so users can click through). */
  source_url?: string | null;
  /** Optional commercial-OK flag derived at ingestion time. Useful later
   *  for image-export or share features that need to filter NC images. */
  commercial_ok?: boolean | null;
}
```

A null `image_credit` falls back to "Unknown source — see `/credits`" rather than rendering nothing. Storing `unknown` explicitly is fine and the badge dims.

## Schema additions

| Table | Column | Notes |
|-------|--------|-------|
| `plants` | `image_credit jsonb` | One per stored hero/thumb pair (they always come from the same provider) |
| `inventory_items` | `image_credit jsonb` | When the user picks a provider photo as the instance hero |
| `plant_image_cache` | `attribution` column **already exists** — extend its shape | No DDL; just write the new keys |
| `plant_journals` | `image_credit jsonb` | User-uploaded so default `{ provider: "user", attribution: null }` |
| `notes` (Wave 22.0001) | No change — TipTap stores images inline; we'll attach credit metadata via a `data-credit` attribute on the `<image>` node so the editor / renderer can surface it |
| `home_seasonal_picks` | `picks.[].image_credit` inside the jsonb payload — no DDL needed |
| `chat_messages` | No change — credit travels in the `suggested_plants[]` JSON shape with the existing `image_url` |

Migration is purely additive — no breaking change to existing reads.

## Capture pipeline updates

| Edge fn | Change |
|---------|--------|
| `perenual-proxy` | Pass through `default_image.{license_name, license_url, original_url}` into a normalised `image_credit`. Also store on the `species_cache` raw payload so callers can re-derive without a re-fetch. |
| `verdantly-search` | Add hard-coded `image_credit: { provider: "verdantly", license_name: "Verdantly Terms of Service", license_url: "https://verdantly.app/terms", source_url: <species page>, attribution: null }` — the API doesn't expose per-image licence, so we credit the platform. |
| `plant-image-search` | Already captures partial attribution. Normalise to the unified `image_credit` shape per source: Unsplash → photographer + page + Unsplash License; Wikipedia → Artist + page + actual `LicenseShortName` / `LicenseUrl` from `extmetadata`; Pixabay → Pixabay page + Pixabay Content License. |
| `submit-plant-library-batch`, `seed-plant-library` | When the seeder enriches a plant via AI/Gemini and grabs a Perenual image, write the credit through. |
| `generate-garden-overhaul` (Imagen) | Write `image_credit: { provider: "ai", license_name: "AI-generated", attribution: "Generated by Rhozly via Google Imagen" }`. |
| `plant-doctor` (identify_vision) | The Pl@ntNet candidate tiles already pass through their image URLs — wrap with `{ provider: "plantnet", license_name: "Pl@ntNet — CC-BY-SA", license_url: "https://creativecommons.org/licenses/by-sa/4.0/" }`. |

## Frontend changes

### 1. New `<ImageCredit>` component

```
<ImageCredit credit={credit} variant="overlay" />
   ↑ bottom-right tiny "ⓘ" pill on hero / large images
<ImageCredit credit={credit} variant="inline" />
   ↑ small italic line below the image — used in tiles / cards
<ImageCredit credit={credit} variant="badge-only" />
   ↑ icon only for tight spaces
```

Tap → pops a small panel with:
- Provider name (with logo where licence allows)
- Attribution string (verbatim — never reformatted)
- Licence name as a link to `license_url`
- "View original" link to `source_url`

When `credit?.provider === "unknown" || !credit`, the badge dims and links to `/credits`.

### 2. New `<CreditedImage>` wrapper

```tsx
<CreditedImage
  src={url}
  credit={credit}
  alt="Tomato 'Sungold'"
  className="…"
  creditVariant="overlay"
/>
```

Renders the existing `<SmartImage>` plus the `<ImageCredit>` positioned absolutely. New surfaces use this; old `<SmartImage>` callsites get migrated surface-by-surface.

### 3. New `/credits` page

A single page listing every provider, their licence terms, and a contact link. Required by Pixabay (link to pixabay.com somewhere on the site) and Unsplash (per their licence FAQ) — covers us for any image that ships without per-image credit because the row pre-dates this change.

### 4. `SmartImage` extension

Stays. Acts as the underlying loader. `CreditedImage` is a composition — not a replacement — so we can roll out per surface without forcing a global refactor.

## Surfaces to update (prioritised)

**Phase A — High-visibility hero/detail surfaces**
- `PlantDetailModal` (Care / Grow Guide / Companions / Light tabs)
- `PlantPreview` hero
- `BulkSearchModal` cart hero
- `InstanceEditModal` plant hero
- `PlantVisualiser` selected plant tile
- `MultiImageGallery` lightbox
- `PlantDoctor` identification candidate tiles
- `/credits` page + nav link in the Account menu

**Phase B — Tiles and chips**
- `PlantResultThumb` (search result thumbnails everywhere) — credit shown on hover/tap
- `TheShed` plant tiles
- `SeasonalPicksCard` tiles + the `PlantDetailModal` opened from them
- `ChatPlantCard` (Garden AI suggestions)
- `MultiImageGallery` strip thumbnails
- `WikiImagePicker`, `SpriteWizard` tabs — already had per-source labels; upgrade to the unified credit popover

**Phase C — Backfill and the long tail**
- Backfill `plants.image_credit` for existing rows: walk `species_cache.raw_data.default_image` to populate Perenual credits without a new API call; for non-Perenual rows mark `{ provider: "unknown" }`.
- Walk `plant_image_cache.attribution` to populate the normalised shape in-place.
- Journal photos default to `{ provider: "user" }` via a one-shot UPDATE.
- Notes — adding `data-credit` to TipTap image nodes on save; existing notes get nothing (user-owned, no licence concern).

## Tier gating

None. Compliance is universal.

## Phasing & deploy plan

This is large enough that I want to ship it as **three** deploys, not one. Each is independently shippable and each delivers visible value:

| Wave | Scope | Bump |
|------|-------|------|
| 22.0002 | Migration + capture pipeline + `<ImageCredit>` / `<CreditedImage>` components + Phase A surfaces + `/credits` page | major |
| 22.0003 | Phase B (tiles, chips, every search result) | minor |
| 22.0004 | Phase C backfill + remaining long-tail surfaces | minor |

22.0002 is enough to legally cover us: every newly-fetched image will carry full credit, every hero displays it, and the `/credits` page is the umbrella attribution required by providers regardless of per-image credit.

## Files modified — full list (for 22.0002 only; 22.0003-4 follow-up)

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_image_credits.sql` | NEW — add `image_credit jsonb` to `plants`, `inventory_items`, `plant_journals` (+ grants per CLAUDE.md) |
| [`supabase/functions/perenual-proxy/index.ts`](../../supabase/functions/perenual-proxy/index.ts) | Pass through licence fields from Perenual's `default_image` |
| [`supabase/functions/verdantly-search/index.ts`](../../supabase/functions/verdantly-search/index.ts) | Emit the Verdantly-credit shape on every result |
| [`supabase/functions/plant-image-search/index.ts`](../../supabase/functions/plant-image-search/index.ts) | Normalise existing per-source attribution into the unified `image_credit` shape |
| [`supabase/functions/plant-doctor/index.ts`](../../supabase/functions/plant-doctor/index.ts) | Attach Pl@ntNet credit on candidate tiles |
| `src/lib/imageCredit.ts` | NEW — TypeScript types + provider name / licence URL constants + "is commercial OK" derivation |
| [`src/lib/perenualService.ts`](../../src/lib/perenualService.ts) | Capture the new credit fields when mapping API data → `plant_library` row shape |
| `src/components/credit/ImageCredit.tsx` | NEW |
| `src/components/credit/CreditedImage.tsx` | NEW |
| `src/components/credit/CreditPopover.tsx` | NEW — the tap-to-reveal panel |
| `src/components/CreditsPage.tsx` | NEW — `/credits` route |
| [`src/components/PlantDetailModal.tsx`](../../src/components/PlantDetailModal.tsx) | Hero uses `CreditedImage` |
| [`src/components/PlantPreview.tsx`](../../src/components/PlantPreview.tsx) | Hero uses `CreditedImage` |
| [`src/components/BulkSearchModal.tsx`](../../src/components/BulkSearchModal.tsx) | Cart hero |
| [`src/components/InstanceEditModal.tsx`](../../src/components/InstanceEditModal.tsx) | Plant hero |
| [`src/components/PlantDoctor.tsx`](../../src/components/PlantDoctor.tsx) | Candidate tiles read `image_credit` from the response |
| [`src/components/MultiImageGallery.tsx`](../../src/components/MultiImageGallery.tsx) | Lightbox + strip |
| [`src/components/UserProfileDropdown.tsx`](../../src/components/UserProfileDropdown.tsx) | Add "Image credits" menu item |
| [`src/App.tsx`](../../src/App.tsx) | Mount `/credits` route |
| [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) | Updated — credit pipeline + `image_credit` jsonb + `<CreditedImage>` |
| NEW `docs/app-reference/99-cross-cutting/40-image-credits.md` | Full cross-cutting reference for the credit model |

## Tests

- **Vitest** — unit tests for `src/lib/imageCredit.ts` (normalisation, "is commercial OK" derivation) and `<ImageCredit>` rendering for all eight providers.
- **Deno** — extend `plant-image-search` test to assert the unified shape; extend `verdantly-search` test to assert credit fields.
- **Playwright** — add a row to `docs/e2e-test-plan.md` for "Plant Detail Modal shows licence popover on hero tap".

## Risks

| Risk | Mitigation |
|------|------------|
| Existing rows have null `image_credit` | `/credits` page is the umbrella attribution. Phase-C backfill walks `species_cache` to populate Perenual rows from cached raw data. Non-Perenual existing rows mark `{ provider: "unknown" }` and the popover gracefully points to `/credits`. |
| Verdantly's ToS isn't a per-image licence | We display "Verdantly Terms of Service" with the platform attribution — the legally correct credit when the source doesn't break down further. Verified against their RapidAPI listing + ToS. |
| Touching `PlantResultThumb` may regress the hot path | Phase B specifically — we deliberately keep the thumbnail self-resolving logic intact; the credit prop is additive. |
| Storage bucket usage on `tts-audio` etc. — not images, no change | None — those aren't user-displayed images. |
| User-uploaded photos lack `image_credit` for old rows | One-shot UPDATE to set `{ provider: "user" }` for any row where `image_url` matches our own buckets (`plant-images`, `journal-photos`). |
| Sprite Wizard already names sources per tab | Keep that — the new credit popover supplements, doesn't replace. |

## Out of scope (deferred)

- Bulk re-fetching Perenual data to refresh stale licences — Perenual's licence per image is stable; we only backfill from `species_cache`.
- A non-commercial filter on plant images (e.g. for export). The `commercial_ok` field is captured ready for it but no UI uses it yet.
- Reverse-image-source detection on user uploads ("did you upload someone else's photo?") — out of scope; trust signal only.
- Updating the Service Worker / PWA cache layer with credit headers — not a compliance requirement; cache continues to store image bytes only.

---

## Recommended split

**Ship 22.0002 first** (this plan body). That's the capture + hero / detail surfaces + `/credits` umbrella page. Phases B and C ship as separate plans after we see the new UI in production, so we can adjust the popover ergonomics before rolling it across every tile.
