# Plant Visualiser — Full Build Plan

> This document is the single source of truth for the Plant Visualiser feature.
> Read this file at the start of any session working on this feature to understand
> current status, decisions made, and exactly what to build next.

---

## Feature Overview

A multi-phase feature allowing users to:
1. Select plants from their shed to visualise
2. Source / generate clean 2D sprites for each plant
3. Open a live camera overlay and drag/resize/position plant sprites to plan their garden

**Phase 1 (this plan): 2D sprite overlay only — no WebXR, no depth detection.**
Phase 2 (future): WebXR plane detection, 3D models. Not in scope here.

---

## Current Build Status

- [x] Section 1 — Plant selection page + cart
- [x] Section 2 — Sprite generation wizard
- [x] Section 3a — Camera + canvas overlay interaction
- [x] Section 3b — Capture + save

---

## Section 1 — Plant Selection Page + Cart

### Status: NOT STARTED

### Route
`/visualiser`

### Nav Link
Add "Visualiser" to the main sidebar nav (alongside Shed, Watchlist, etc.)

### Page Layout
- Page header: "Plant Visualiser" + subtitle
- Search bar (filters by plant name)
- Filter pills: by Location, by Area, by plant type (similar to TheShed filters)
- Plant grid: same card style as TheShed, showing plants from user's shed
- Each card has a toggle/select button — click to add/remove from cart
- Selected plants shown with a highlight ring (same pattern as BulkSearchModal)
- Sticky bottom bar when cart has items:
  - Shows count of selected plants
  - "Continue →" button → triggers Section 2 wizard

### Quantity
**No quantity selector.** Users add a plant once to the cart. Multiple instances
of the same plant are created by dragging from the camera tray repeatedly.

### Data Source
- Reads from `plants` table filtered by `home_id`
- Only shows active (non-archived) plants
- Reuses existing plant data already in the shed

### Component
`src/components/PlantVisualiser.tsx` — main page component
`src/components/PlantVisualiserCard.tsx` — individual plant selection card (optional, can inline)

### Cart State
Local state only — `Set<string>` of plant IDs. No DB persistence needed for cart.

---

## Section 2 — Sprite Generation Wizard

### Status: NOT STARTED

### Trigger
"Continue →" button from Section 1 cart bar opens this as a modal over the visualiser page.

### Purpose
For each plant in the cart, source a clean PNG sprite (background removed) and cache it.
Once all plants have sprites confirmed, wizard closes and "Open Visualiser" button becomes active.

### Database: `plant_sprites` table

```sql
CREATE TABLE public.plant_sprites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id      uuid REFERENCES public.plants(id) ON DELETE CASCADE,
  perenual_id   integer,           -- Perenual species ID (null for manual plants)
  sprite_url    text NOT NULL,     -- Supabase Storage public URL (cleaned PNG)
  source        text NOT NULL,     -- 'pixabay' | 'perenual' | 'wikipedia' | 'inaturalist' | 'fallback'
  plant_name    text,              -- Normalised lowercase name (secondary cache key)
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_plant_sprites_perenual ON public.plant_sprites (perenual_id)
  WHERE perenual_id IS NOT NULL;
CREATE INDEX idx_plant_sprites_name ON public.plant_sprites (plant_name)
  WHERE plant_name IS NOT NULL;
```

### Supabase Storage
- Bucket: `plant-sprites` (public read, auth write)
- Path: `{perenual_id}/{timestamp}.png` or `manual/{plant_id}/{timestamp}.png`

### Cache Lookup Logic (per plant)
```
1. Has perenual_id?
   → Query plant_sprites WHERE perenual_id = ?
   → If found: show cached sprite, skip image picker
2. No perenual_id (manual plant):
   → Query plant_sprites WHERE plant_name = lower(plant.common_name)
   → If found: show cached sprite, skip image picker
3. Nothing cached:
   → Open image picker tabs
```

### Wizard Flow (per plant)
```
Plant N of M

[If cached]:
  Show sprite preview
  Buttons: "Use this" → advance to next plant
           "Find different" → open image picker tabs

[If no cache / "Find different"]:
  4-tab image picker:
  ┌─────────────────────────────────────┐
  │ Pixabay | Perenual | Wikipedia | iNaturalist │
  └─────────────────────────────────────┘
  Each tab: scrollable grid of image thumbnails
  User clicks image to highlight it
  "Use this image" button:
    → Show processing spinner ("Removing background…")
    → Run @imgly/background-removal on selected image
    → Show cleaned sprite preview with transparency
    → "Confirm" button:
        → Upload PNG to Supabase Storage
        → Insert row into plant_sprites table
        → Advance to next plant

[If user skips / no results anywhere]:
  "Use silhouette" option:
    → Pick SVG based on plant type (see Fallback SVGs below)
    → No background removal needed (SVGs are pre-designed)
    → Cache in plant_sprites with source = 'fallback'
    → Advance to next plant
```

### Image Source APIs

| Tab | API | Auth | Notes |
|-----|-----|------|-------|
| Pixabay | `https://pixabay.com/api/` | API key (env var `VITE_PIXABAY_API_KEY`) | Free, 100 req/min, no attribution needed |
| Perenual | Already integrated via `PerenualService` | Existing | Use `item.images[]` array from pest/disease or plant detail |
| Wikipedia | `https://en.wikipedia.org/api/rest_v1/page/summary/{name}` | None | Returns `thumbnail.source` |
| iNaturalist | `https://api.inaturalist.org/v1/search?q={name}&sources=taxa` | None | Returns `taxon.default_photo.medium_url` and related photos |

**Pixabay search query:** `"{plant_name} plant isolated"` as primary, `"{plant_name} plant"` as fallback if <3 results.

**iNaturalist search:** Use `/v1/taxa?q={name}&rank=species` → get taxon_photos for the matched taxon.

### Background Removal
Package: `@imgly/background-removal`  
Install: `npm install @imgly/background-removal`  
Runs entirely in browser via WASM — no API calls, no cost, no rate limits.  
Only invoked when user clicks "Use this image" — not on preview.

### Fallback SVG Silhouettes
Pre-designed SVG templates mapped to plant type (from Perenual `type` or inferred):
- `shrub` — rounded bush silhouette
- `tree` — trunk + canopy silhouette
- `grass` — ground cover / grass clump
- `climber` — vine on trellis shape
- `succulent` — rosette shape
- `herb` — small bushy mound

SVGs stored as React components in `src/components/visualiser/PlantSilhouettes.tsx`

### Growth Stage Data (collected during wizard, used in Section 3)
From Perenual data already on the plant record:
- `min_height`, `max_height` (in inches — Perenual uses imperial)
- Convert to cm: `value * 30.48`

For plants without Perenual data (manual):
- Gemini call: `"What is the typical mature height range in cm of {plant_name}? Return JSON: { min_height_cm: number, max_height_cm: number }"`
- Store result on plant_sprites row as `height_min_cm` / `height_max_cm` columns (add to migration)

Three growth presets (calculated at render time in Section 3):
- **Seedling** = 15% of max height
- **Established** = 50% of max height
- **Mature** = 100% of max height

These are relative size hints — actual on-screen size is still manually controlled by user.

### Component
`src/components/SpriteWizardModal.tsx`

Props:
```tsx
{
  plants: Plant[];              // selected plants from cart
  homeId: string;
  onComplete: (sprites: Map<string, string>) => void;  // plantId → spriteUrl
  onClose: () => void;
}
```

---

## Section 3a — Camera + Canvas Overlay

### Status: NOT STARTED

### Trigger
"Open Visualiser" button (enabled after all sprites confirmed in Section 2).
Opens as a full-screen overlay/modal (or navigate to `/visualiser/camera`).

### Rendering Architecture
**Canvas approach** (not CSS/HTML overlay) — required for capture in Section 3b.

```
<div fullscreen>
  <video autoPlay muted (camera feed, behind canvas, display:none for rendering)>
  <canvas (full screen, pointer events enabled)>
  <UI overlay divs (tray, controls, buttons — HTML over canvas)>
</div>
```

The canvas renders:
1. Video frame (via `ctx.drawImage(videoEl, 0, 0)`) on each animation frame
2. All placed sprite instances at their positions/scales
3. Selection handles if an instance is selected

### Camera Setup
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment' }  // rear camera on mobile
});
videoEl.srcObject = stream;
```

### Data Structures
```typescript
interface PlantInstance {
  instanceId: string;       // unique per drag (crypto.randomUUID())
  plantId: string;
  spriteUrl: string;
  spriteImg: HTMLImageElement;  // pre-loaded
  x: number;               // centre x on canvas
  y: number;               // centre y on canvas
  scale: number;           // 0.1 to 2.0, user controlled
  scalePreset: 'seedling' | 'established' | 'mature' | 'custom';
}
```

### Plant Tray (bottom UI)
- Horizontal scrollable strip at bottom of screen (HTML div over canvas)
- Shows one chip per plant type in cart (NOT per instance — instances are created by dragging)
- Each chip: plant thumbnail + name
- User **drags from tray onto canvas** → creates a new PlantInstance at drop position
- Dragging from tray multiple times creates multiple instances of same plant

### Instance Lifecycle
```
Drag from tray → create instance at drop point → render on canvas
Tap instance   → select (show controls)
Drag instance  → reposition
Pinch instance (mobile) or drag corner handle (desktop) → free resize
Tap S/M/L button → set scalePreset → scale instance
Tap delete (×) on selected instance → remove instance
```

### Resize
Two mechanisms:
1. **Preset buttons** (S / M / L) on selected instance controls:
   - S = 30% of canvas height
   - M = 50% of canvas height
   - L = 75% of canvas height
2. **Free resize** — pinch on mobile, drag corner handle on desktop
   - Clamps to min 5%, max 100% of canvas height

No real-world scale — purely visual, user-controlled.

### Controls Layout
```
┌─────────────────────────────────────┐
│ [×] Exit          [📷] Capture      │  ← top bar (HTML)
│                                     │
│         < canvas area >             │
│   (plants dragged here)             │
│                                     │
│  [S][M][L]  [🗑]  ← when selected  │  ← appears above selected plant
│─────────────────────────────────────│
│  [🌿 Rose] [🌿 Lavender] [🌿 Oak]  │  ← tray (HTML)
└─────────────────────────────────────┘
```

### Animation Loop
```typescript
function renderLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  for (const inst of instances) {
    ctx.save();
    ctx.translate(inst.x, inst.y);
    const h = canvas.height * inst.scale;
    const w = h * (inst.spriteImg.naturalWidth / inst.spriteImg.naturalHeight);
    ctx.drawImage(inst.spriteImg, -w / 2, -h, w, h);  // anchor at base
    ctx.restore();
  }
  requestAnimationFrame(renderLoop);
}
```

### Component
`src/components/PlantCameraView.tsx`

Props:
```tsx
{
  plants: Plant[];
  sprites: Map<string, string>;  // plantId → spriteUrl
  onClose: () => void;
}
```

---

## Section 3b — Capture + Save

### Status: NOT STARTED

### Capture Flow
1. User taps "Capture" (📷) button in top bar
2. One final render pass: draw video frame + all instances onto canvas
3. `canvas.toDataURL('image/jpeg', 0.9)` → base64 JPEG
4. Convert to Blob, upload to Supabase Storage
5. Insert record into `visualiser_captures` table
6. Show toast: "Captured! View in your gallery →"

### Storage
- Bucket: `visualiser-captures` (private, RLS by home_id)
- Path: `{home_id}/{timestamp}.jpg`

### Database: `visualiser_captures` table
```sql
CREATE TABLE public.visualiser_captures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid NOT NULL,
  image_url   text NOT NULL,        -- Supabase Storage URL
  plant_ids   uuid[],               -- which plants were in view
  created_at  timestamptz DEFAULT now()
);
```

### Gallery
- Accessible from the visualiser page header (camera icon + count badge)
- Simple modal grid of thumbnail captures
- Each shows: image, date, plant names used
- Can delete individual captures

---

## Infrastructure Summary

### New NPM Packages
```
@imgly/background-removal
```

### New Environment Variables
```
VITE_PIXABAY_API_KEY=...
```

### New Supabase Migrations Needed
1. `plant_sprites` table (Section 2)
2. `visualiser_captures` table (Section 3b)
3. Storage buckets: `plant-sprites` (public), `visualiser-captures` (private)

### New Routes
- `/visualiser` — Section 1 + 2 (selection + wizard)
- Camera is a fullscreen component mounted over the visualiser page (no new route needed)

### New Components
| Component | Section | Description |
|-----------|---------|-------------|
| `PlantVisualiser.tsx` | 1 | Main page: plant grid + cart |
| `SpriteWizardModal.tsx` | 2 | Per-plant sprite generation wizard |
| `PlantSilhouettes.tsx` | 2 | SVG fallback silhouettes |
| `PlantCameraView.tsx` | 3a | Camera + canvas overlay |
| `CaptureGallery.tsx` | 3b | Gallery of saved captures |

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| No quantity in cart | User drags multiple instances in camera instead |
| Unsplash dropped | Attribution requirement + 50 req/hr limit. Replaced with iNaturalist |
| Background removal on confirm only | Prevents wasted processing while user browses image options |
| Canvas not CSS overlay | Required for `canvas.toDataURL()` capture to work correctly |
| Cache keyed by perenual_id first | Same species shared across users saves repeat API calls |
| Manual resize only (no real-world scale) | Phase 2 (WebXR) needed for accurate real-world sizing |
| 3 growth presets (S/M/L) + free resize | Presets for quick sizing, free for precision |
| iNaturalist over Unsplash | Free, no attribution, large plant photo database |

---

## API Reference

### Pixabay
```
GET https://pixabay.com/api/?key={VITE_PIXABAY_API_KEY}&q={query}&image_type=photo&per_page=12
Response: { hits: [{ webformatURL, previewURL, largeImageURL }] }
```

### iNaturalist Taxa
```
GET https://api.inaturalist.org/v1/taxa?q={name}&rank=species&per_page=5
Response: { results: [{ id, name, default_photo: { medium_url }, taxon_photos: [{ photo: { medium_url } }] }] }
```

### Wikipedia (already in use)
```
GET https://en.wikipedia.org/api/rest_v1/page/summary/{name}
Response: { thumbnail: { source }, originalimage: { source } }
```

---

*Last updated: 2026-04-29*
*Next action: Build Section 3a — Camera + Canvas Overlay*

**Environment variable needed:** `VITE_PIXABAY_API_KEY` in `.env` — get a free key at pixabay.com/api. Without it the Pixabay tab shows "API key not configured" but the other three tabs still work.

**Gemini height lookup deferred:** The `height_min_cm`/`height_max_cm` columns are in the migration but not yet populated. Section 3 S/M/L presets will use canvas-percentage defaults instead (30%/50%/75% of canvas height).
