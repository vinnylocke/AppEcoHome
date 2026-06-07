# Plan — 22.0003: wire image credit badge into every visible hero + tile

Wave B of the licensing rollout. 22.0002 landed the capture pipeline, the components, and the `/credits` umbrella page. This wave makes the badge **visible everywhere images live in the app**.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) — already documents the unified `image_credit` shape captured in 22.0002
- [`docs/app-reference/08-modals-and-overlays/29-multi-image-gallery.md`](../app-reference/08-modals-and-overlays/29-multi-image-gallery.md), [`30-diagnosis-gallery.md`](../app-reference/08-modals-and-overlays/30-diagnosis-gallery.md), [`34-wiki-image-picker.md`](../app-reference/08-modals-and-overlays/34-wiki-image-picker.md) — galleries that consume `plant-image-search`
- [`docs/app-reference/03-garden-hub/01-the-shed.md`](../app-reference/03-garden-hub/01-the-shed.md), [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) — tile surfaces
- [`docs/app-reference/05-tools/02-plant-doctor.md`](../app-reference/05-tools/02-plant-doctor.md) — Pl@ntNet candidate tiles

## Approach

Two patterns:

1. **Hero / large surfaces** — replace `<img>` / `<SmartImage>` with `<CreditedImage credit={…} creditVariant="overlay" />` so the badge sits bottom-right.
2. **Tiles / thumbnails** — `<ImageCredit variant="badge-only" />` positioned `absolute bottom-1 right-1` over the existing thumbnail markup. The badge-only variant is a small icon-only pill so it doesn't crowd a tile.

The canonical thumbnail component `PlantResultThumb` gets a single `credit?` prop. Adding it there cascades to every surface that uses it (search results everywhere, Shed tiles, seasonal picks, planner cart, etc.) — one edit, broad reach.

## Surfaces touched

| Surface | Variant | Source of credit |
|---------|---------|------------------|
| [`PlantResultThumb`](../../src/components/PlantResultThumb.tsx) | `badge-only` overlay | New `credit` prop threaded from each caller (defaults to null → dimmed badge) |
| [`MultiImageGallery`](../../src/components/MultiImageGallery.tsx) | `overlay` on the active lightbox image; `badge-only` on each strip thumb | `image_credit` already on `plant-image-search` results (22.0002) |
| [`BulkSearchModal`](../../src/components/BulkSearchModal.tsx) cart hero | `overlay` | `result.image_credit` from Perenual / Verdantly mappings |
| [`PlantDoctor`](../../src/components/PlantDoctor.tsx) Pl@ntNet candidate tiles | `inline` credit line under the tile | New `image_credit` on `plantnet` tiles — added in this wave |
| [`ChatPlantCard`](../../src/components/chat/ChatPlantCard.tsx) — Garden AI suggestion cards | `badge-only` | Wikipedia-sourced; thread credit through |
| [`SeasonalPicksCard`](../../src/components/seasonal/SeasonalPickTile.tsx) tiles | `badge-only` | When the tile carries a remote image (else hide the badge) |

`TheShed` plant tiles defer until 22.0004 — they're user-instance heroes and the column is being backfilled at that point.

## Plant-doctor edge function — emit credit on Pl@ntNet tiles

Tiny addition: when synthesising `possible_names` from Pl@ntNet's top matches, also include an `image_credit` on each tile (Pl@ntNet's species image rights are CC-BY-SA per their docs). The UI then renders an inline credit line under the candidate tile.

## Files modified

| File | Change |
|------|--------|
| [`src/components/PlantResultThumb.tsx`](../../src/components/PlantResultThumb.tsx) | New optional `credit?: ImageCredit \| null` prop; renders badge-only overlay when present |
| [`src/components/MultiImageGallery.tsx`](../../src/components/MultiImageGallery.tsx) | Overlay credit on the active lightbox image; badge-only on strip |
| [`src/components/BulkSearchModal.tsx`](../../src/components/BulkSearchModal.tsx) | Wrap the cart hero in `<CreditedImage>` |
| [`src/components/PlantDoctor.tsx`](../../src/components/PlantDoctor.tsx) | Inline credit line on the Pl@ntNet tiles |
| [`supabase/functions/plant-doctor/index.ts`](../../supabase/functions/plant-doctor/index.ts) | Emit `image_credit` on `plantnet` candidates |
| [`src/components/chat/ChatPlantCard.tsx`](../../src/components/chat/ChatPlantCard.tsx) | Wikipedia credit on the card hero |
| [`src/components/seasonal/SeasonalPickTile.tsx`](../../src/components/seasonal/SeasonalPickTile.tsx) | Badge-only credit when image present |
| [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) | Mark per-surface integrations as live |

## Tests

Visual / e2e only. No new units required — the `<ImageCredit>` component is exercised in every surface integration.

## Deploy

- One function deploy (`plant-doctor`)
- Vercel deploy
- Minor bump → **22.0003**

## Risks

- Tiles are tight on space. The `badge-only` variant is 20px × 20px and sits over the bottom-right corner with a white ring; doesn't crowd thumbnails at any tile size shipped today.
- `PlantResultThumb` is hot — used in every search list. The `credit` prop is optional + defaults to null, so existing callers compile cleanly. Surfaces that have credit data pass it; the rest get the same render they had before.
