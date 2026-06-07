# Plan — Plant search credit + in-app lightbox for plant gallery thumbs

## Two user-reported issues

1. **Plant search credit isn't visible.** Browsing the Shed's plant search results, the `PlantSearch` component renders `ResultRow → PlantResultThumb` but never threads the row's `image_credit` through to the thumb. PlantResultThumb supports the badge (Wave 22.0003); the data just isn't being passed.
2. **Tapping a plant gallery image opens a new browser tab.** Confirmed at [`PlantInfoPanel.tsx:185-198`](../../src/components/PlantInfoPanel.tsx#L185-L198) — every thumbnail in the plant info gallery is wrapped in `<a href={img.full_url} target="_blank">`. The user wants an in-app lightbox with next/prev navigation.

## App-reference files consulted

- [`docs/app-reference/03-garden-hub/01-the-shed.md`](../app-reference/03-garden-hub/01-the-shed.md) — the search surface affected
- [`docs/app-reference/08-modals-and-overlays/29-multi-image-gallery.md`](../app-reference/08-modals-and-overlays/29-multi-image-gallery.md) + [`30-diagnosis-gallery.md`](../app-reference/08-modals-and-overlays/30-diagnosis-gallery.md) — the existing in-app `Lightbox` component (keyboard nav, attribution overlay, focus trap) ready to reuse
- [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) — the credit shape + components

## Approach

### Issue 1 — credit on plant search rows

Thread `image_credit` through `PlantSearch.ResultRow` to `PlantResultThumb`. Three edit points:

1. **`PlantSearch.tsx`** — the library result map already destructures `row` and the external result map destructures `r`. Both row shapes carry `image_credit` (library rows came through `perenualService` post-22.0002; external `_provider === "perenual"` rows come straight from the Perenual response). Pass it as a new `credit` prop on `ResultRow`.
2. **`ResultRow` interface + render** — add a `credit?: unknown` prop, forward to `PlantResultThumb credit={credit}`.
3. **`PlantResultThumb`** — already handles the badge layout. No change.

The 44px thumb is tight, but the badge-only variant (20×20 with white ring) sits cleanly bottom-right. Worst case it overlaps the leaf placeholder area when an image is missing, but the badge only renders when there's a real image AND a known credit, so placeholders never show it.

### Issue 2 — in-app lightbox in PlantInfoPanel

Replace the `<a target="_blank">` wrapper with a `<button>` that opens the existing `Lightbox` from `DiagnosisImageGallery`. The Lightbox already supports:
- Click outside / Esc to close
- Left / Right arrow keys for prev / next
- On-screen prev / next chevrons
- Per-image attribution overlay (Unsplash photographer, Wiki page, etc.)

We just point the lightbox at the already-loaded `galleryImages` array and let it manage state.

```tsx
// Before
<a href={img.full_url} target="_blank" rel="noopener noreferrer" ...>
  <img src={img.thumb_url} ... />
</a>

// After
<button onClick={() => setLightboxIndex(i)} ...>
  <img src={img.thumb_url} ... />
</button>
{lightboxIndex !== null && (
  <Lightbox
    images={galleryImages}
    startIndex={lightboxIndex}
    onClose={() => setLightboxIndex(null)}
  />
)}
```

The Lightbox already has the per-provider attribution overlay, so the licence info shows there too — no extra wiring needed. The user gets:
- In-app enlargement (no new tab)
- Prev / next navigation
- Licence visible alongside the full-size image

## Files modified

| File | Change |
|------|--------|
| [`src/components/shared/PlantSearch.tsx`](../../src/components/shared/PlantSearch.tsx) | Thread `image_credit` from row → `ResultRow` → `PlantResultThumb` |
| [`src/components/PlantInfoPanel.tsx`](../../src/components/PlantInfoPanel.tsx) | Replace `<a target="_blank">` gallery thumbs with `<button>` + `Lightbox` |
| [`docs/app-reference/99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) | Note the new surface integrations |

## Tests

Visual / e2e only. No new units required.

## Deploy

- Frontend-only
- Minor bump → **22.0005**

## Risks

- **44px thumb overlap** — the badge ring + icon are small enough to fit cleanly in the bottom-right corner. If it crowds, we can switch to an even tinier dot indicator in a follow-up.
- **Lightbox z-index inside the plant info panel** — the existing Lightbox uses `createPortal` to the body, so the host modal's z-index doesn't matter.
- **No data layer changes** — purely additive UI work.
