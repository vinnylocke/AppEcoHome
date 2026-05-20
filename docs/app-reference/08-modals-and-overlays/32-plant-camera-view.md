# Plant Camera View

> The AR / photo overlay view inside Plant Visualiser. User picks plants + sprites, then drops them on top of a live camera feed (mobile AR) or a static photo (web fallback). Pinch/zoom + drag to position. Snapshot saves to Capture Gallery; optional AI placement analysis.

**Source file:** `src/components/PlantCameraView.tsx`

---

## Quick Summary

Full-screen camera/photo canvas. Each selected plant becomes a draggable `PlantInstance` with `{ x, y, scale, scalePreset }`. User drags sprites around; pinch/scale to size; tap remove. Tap shutter → composite image rendered to canvas → uploaded to `visualiser-captures` bucket + `visualiser_captures` row inserted. Optional AI analysis (`analyse-visualiser-placement`) provides per-plant placement feedback.

---

## Role 1 — Technical Reference

### Component graph

```
PlantCameraView (Portal, full-screen)
├── Camera feed / photo background
├── Canvas overlay
│   └── PlantInstance (draggable sprite + scale handles)
├── Toolbar
│   ├── Plant chips (tap to add)
│   ├── Scale preset (S / M / L / Custom)
│   ├── Delete sprite
│   ├── Shutter
│   └── AI analyse (Sage/Evergreen)
└── Analysis result panel
```

### `PlantInstance` shape

```ts
{
  instanceId, plantId,
  spriteImg: HTMLImageElement,
  x, y,                  // canvas coords
  scale,                 // fraction of canvas height
  scalePreset: "s"|"m"|"l"|"custom",
}
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plants` | `Plant[]` | parent | Selected plants |
| `sprites` | `Map<plantId, url>` | parent | Sprite assignments |
| `homeId` | `string` | parent | Scope |
| `aiEnabled` | `boolean?` | parent | AI analyse gate |
| `onClose` | `() => void` | parent | Hide |
| `onCapture` | `(storagePath) => void?` | parent | Post-save hook |

### Scale presets

```ts
{ s: 0.3, m: 0.5, l: 0.75 }
SCALE_MIN = 0.05
SCALE_MAX = 1.0
```

### Data flow — write paths

- Upload composite PNG to `visualiser-captures/{homeId}/{uuid}.png`.
- `visualiser_captures.insert({ home_id, image_url, plant_ids })`.
- `logEvent(VISUALISER_CAPTURE)`.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `analyse-visualiser-placement` | AI feedback on placement (Sage/Evergreen) |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

| Feature | Tier |
|---------|------|
| Photo / AR mode | Every tier |
| AI analyse | Sage / Evergreen |

### Beta gating

None.

### Permissions

- `inventory.read` to load plants.
- Camera permission.

### Error states

| State | Result |
|-------|--------|
| Camera denied | Falls back to photo mode (library pick) |
| Sprite missing | Plant skipped with warning |
| Capture upload fails | Toast |

### Performance

- Canvas drawing on RAF.
- Pinch/zoom uses pointer events for cross-platform.

### Linked storage buckets

- `visualiser-captures` — composite outputs.

---

## Role 2 — Expert Gardener's Guide

### Why use this view

The actual visualisation. Drop sprites of plants you're considering onto a photo / live view of the space. See spacing, scale, density before you buy.

### Every flow

#### 1. Pick a plant chip

- Adds to the canvas at default position + size.

#### 2. Drag

- Reposition. Pinch / scale handles to resize.

#### 3. Multiple plants

- Repeat. Build the full bed.

#### 4. Capture

- Shutter saves to gallery + (optionally) runs AI placement analysis.

#### 5. Analyse

- AI checks each plant's placement: sun match, spacing, companion conflicts.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout/Botanist | Manual placement only. |
| Sage/Evergreen | + AI placement feedback. |

### Common mistakes / pitfalls

- **Sizing too small.** Sprites at min scale are barely visible. Use M as default.
- **Cluttering.** More than 8-10 sprites overwhelms — split into multiple captures.
- **AR jitter on Android.** Use photo mode if AR is shaky.

### Recommended workflows

- **Plan a bed:** add plants → tweak placement → AI analyse → adjust → capture.

### What to do if something looks wrong

- **Camera black:** permission denied. Switch to photo mode.
- **Sprite missing:** plant wasn't assigned a sprite. Run Sprite Wizard.

---

## Related reference files

- [Plant Visualiser](../05-tools/05-plant-visualiser.md)
- [Sprite Wizard](../05-tools/06-sprite-wizard.md)
- [Capture Gallery](./31-capture-gallery.md)

## Code references for ongoing maintenance

- `src/components/PlantCameraView.tsx`
- `supabase/functions/analyse-visualiser-placement/index.ts`
- `visualiser-captures` bucket
