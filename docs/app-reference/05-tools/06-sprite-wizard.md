# Sprite Wizard

> A step-through modal that lets the user pick or upload a sprite for each plant they've selected in Plant Visualiser. Sources include Pixabay, Perenual, Wikipedia, iNaturalist, and personal uploads. Background removal runs client-side via `@imgly/background-removal` for clean transparent sprites.

**Trigger:** "Choose Plant Icons" button in Plant Visualiser.
**Source file:** `src/components/SpriteWizardModal.tsx`

---

## Quick Summary

For each selected plant (one at a time), the wizard offers 5 tabs of image sources. User picks an image → it auto-runs through background removal → confirms → moves to next plant. On finish, returns a `Map<plantId, spriteUrl>` to the parent. Falls back to vector silhouettes if no acceptable image found.

---

## Role 1 — Technical Reference

### Component graph

```
SpriteWizardModal (Portal)
├── Header (close, plant counter "3 of 5")
├── Plant info row (icon + name)
├── Tab bar (Pixabay / Perenual / Wikipedia / iNaturalist / Personal)
├── Image grid (per active tab)
│   └── Click → goes to background removal phase
├── Silhouette fallback grid (vector shapes by plant_type)
├── Personal upload zone (when active tab = personal)
├── Confirmation preview (transparent PNG)
├── Save → Supabase storage upload
└── Next button (advance to next plant)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plants` | `Plant[]` | PlantVisualiser | Selected plants to process |
| `homeId` | `string` | PlantVisualiser | For storage path |
| `onComplete` | `(sprites: Map<string, string>) => void` | PlantVisualiser | Returns sprite map |
| `onClose` | `() => void` | PlantVisualiser | Hide |

### Local state

| State | Purpose |
|-------|---------|
| `idx` | Current plant index |
| `phase` | "loading" / "cached" / "picking" / "removing-bg" / "confirming" / "saving" / "silhouette" |
| `cachedUrl` | Pre-existing sprite for this plant (`inventory_items.sprite_url`) |
| `activeTab` | Image source tab |
| `tabStates` | Per-tab image arrays + loading/error flags |
| Resolved sprites map | Built up across plants, returned on Complete |

### Image sources

| Tab | Provider | Notes |
|-----|----------|-------|
| Pixabay | Pixabay API | Free CC0 images |
| Perenual | Perenual API | Plant-specific |
| Wikipedia | Wikipedia REST | Commons-licensed |
| iNaturalist | iNaturalist API | Community photos |
| Personal | Upload | File input → preview |

### Background removal

`@imgly/background-removal` — runs in-browser via WebAssembly. Outputs a transparent PNG blob. No server calls for image processing.

### Data flow — write paths

#### Per plant
- Upload background-removed PNG to `plant-sprites` bucket as `${homeId}/${plantId}.png`.
- Update `inventory_items.sprite_url = publicUrl`.

### Edge functions invoked

None — all client-side (image search APIs are called directly with public/cached keys).

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

- Sprite wizard available to every tier.
- AI sprite generation (separate Sage/Evergreen flow) replaces this for some plants.

### Beta gating

None.

### Permissions

- Storage upload requires home membership.

### Error states

| State | Result |
|-------|--------|
| Image fetch fails | Tab shows error state with retry |
| Background removal fails | Fall back to original image |
| Upload fails | Toast; can retry |
| No images on any tab | Silhouette grid shown |

### Performance

- BG removal model loads on first use (cached afterwards) — ~10 MB WASM.
- Tabs lazy-load images.
- Cached sprite for already-set plants is shown immediately as "cached".

### Linked storage buckets

- `plant-sprites` — public read; auth write per RLS.

---

## Role 2 — Expert Gardener's Guide

### Why use this wizard

Visualiser needs an icon per plant to drop onto a photo. The wizard finds that icon for you — searches five sources, removes the background, lets you confirm. For users who like more control, the silhouette grid offers stylised shapes by plant type (tree / shrub / herb / flower).

### Every flow on the wizard

#### 1. Image picker

- Five tabs of image sources. Default Pixabay (most diverse).
- Tap a thumbnail → background removal kicks in → preview.

#### 2. Confirm

- Background-removed PNG shown. Looks right? Confirm → upload.

#### 3. Silhouette fallback

- If you don't like any image, switch to silhouette tab — pick a vector shape that matches your plant's growth habit.

#### 4. Personal upload

- Drop or browse for your own image. Useful for unusual cultivars not in any database.

#### 5. Next plant

- Once one sprite is saved, the wizard advances to the next plant in your selection.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Plant counter | "3 of 5" |
| Tab | Image source |
| Cached badge | Plant already has a sprite — skip if you want |
| BG-removed preview | What will be saved |
| Silhouette preview | Vector shape option |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Picking a busy image with overlapping objects.** BG removal handles simple subjects well; complex backgrounds (especially with stems crossing) confuse it.
- **Skipping personal upload for unusual cultivars.** Database images may show a different cultivar of the same species — your homegrown image is more accurate.
- **Background removal slow on first use.** The 10 MB WASM model loads only once per session; subsequent plants are fast.

### Recommended workflows

- **First-time setup:** run wizard once for every plant in your Shed → all sprites cached → future Visualiser sessions are instant.
- **Per-plant tweaks:** if a sprite looks wrong, re-open Visualiser, pick that plant, run wizard again — overwrites.

### What to do if something looks wrong

- **Sprite looks white on white:** background removal struggled. Try a different source image or use silhouette.
- **Wizard stuck on "loading":** WASM model didn't load. Check console for CORS errors.
- **Personal upload didn't save:** check storage quota.

---

## Related reference files

- [Plant Visualiser](./05-plant-visualiser.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Image Sources (cross-cutting)](../99-cross-cutting/24-image-sources.md)

## Code references for ongoing maintenance

- `src/components/SpriteWizardModal.tsx` — wizard
- `src/components/visualiser/PlantSilhouettes.tsx` — vector fallback
- `@imgly/background-removal` — WASM BG remover
- `src/hooks/useFocusTrap.ts` — focus trap
- `plant-sprites` bucket policies
