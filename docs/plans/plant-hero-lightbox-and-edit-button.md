# Plan — Plant hero opens lightbox; pencil button changes the image

Reported on the Shed → tap plant → Care Guide flow ([`PlantEditModal`](../../src/components/PlantEditModal.tsx) renders [`ManualPlantCreation`](../../src/components/ManualPlantCreation.tsx)):

- **Current**: in edit mode, tapping the hero image fires the OS file picker ("Change Photo").
- **Desired**: tapping the image opens it in an in-app lightbox (the same one the gallery thumbs use in 22.0005), so the user can see it full-size + see the licence. A small dedicated button in the corner of the image triggers the change-image flow.

## Approach

In [`ManualPlantCreation.tsx`](../../src/components/ManualPlantCreation.tsx) (the only place that hosts the hero):

1. **Reuse the existing `Lightbox`** from `DiagnosisImageGallery` (already imported across the app). One-element array built from the current image URL + the row's `image_credit`.
2. **Hero click → opens lightbox** in both read-only and edit modes (when an image is present). In read-only mode this means the catalogue plant's hero now also enlarges in-app — a positive side effect.
3. **Corner pencil button — edit mode + image present** — a 36px circular button at the top-right of the hero. `aria-label="Change photo"`. Clicking it stops propagation and fires `fileInputRef.current?.click()`. Replaces the current full-tile "Change Photo" overlay text.
4. **Empty-state click** — when no image is present, tapping the hero still opens the file picker (the empty-state pattern is unchanged).
5. **Image credit badge** stays where it is via `PlantResultThumb` (read-only path). In edit mode the editor renders the plain `<img>`; I'll add an `<ImageCredit variant="badge-only">` at the bottom-right so the badge is consistent across both modes.

## Tiny structural changes

```tsx
// New state
const [heroLightboxOpen, setHeroLightboxOpen] = useState(false);

// Build the one-image gallery shape
const heroUrl = formData.image_url || formData.thumbnail_url || null;
const heroCredit = (initialData as any)?.image_credit ?? (formData as any)?.image_credit ?? null;
const heroLightboxImages: GalleryImage[] = heroUrl ? [{
  id: "hero",
  thumb_url: heroUrl,
  full_url: heroUrl,
  alt: formData.common_name || "Plant",
  source: "stored",
  image_credit: heroCredit ?? undefined,
}] : [];
```

Click handler logic on the hero wrapper:

```ts
const hasImage = !!heroUrl;
const onClick = () => {
  if (hasImage) setHeroLightboxOpen(true);
  else if (!isReadOnly) fileInputRef.current?.click();
};
```

Corner pencil button visible only when `!isReadOnly && hasImage`. The hidden `<input type="file">` is unchanged.

## Files modified

| File | Change |
|------|--------|
| [`src/components/ManualPlantCreation.tsx`](../../src/components/ManualPlantCreation.tsx) | Hero click → lightbox; pencil corner button → file picker; lightbox + credit-badge rendering |

## Tests

Visual / e2e only. No new units.

## Deploy

Frontend-only. Minor bump → **22.0006**.

## Risks

- Mobile tap-target: 36 px circular pencil button hits the 44 px minimum guidance comfortably.
- Hover overlay "Change Photo" goes away — replaced by an icon button + tooltip. Net positive: separates "view" and "edit" affordances which is what the user asked for.
