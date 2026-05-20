# Plant Visualiser

> An AR / 2D plant placement tool. Pick plants from your Shed, assign each a sprite (via the Sprite Wizard), then overlay them onto a live camera feed (mobile AR) or a static photo (web).

**Route:** `/visualiser`
**Source files:**
- `src/components/PlantVisualiser.tsx` — gallery + sprite picker
- `src/components/SpriteWizardModal.tsx` — sprite assignment
- `src/components/PlantCameraView.tsx` — AR view
- `src/components/CaptureGallery.tsx` — past captures

---

## Quick Summary

Two-step flow:

1. **Pick + Sprite** — search/filter the Shed, multi-select plants, hit "Choose Plant Icons" → SpriteWizardModal asks you to assign a sprite per plant.
2. **Camera View** — switch to AR mode (mobile) or photo mode (web). Sprites are draggable overlays onto the scene. Capture the final composition; saved to `visualiser_captures`.

A separate Capture Gallery surfaces past compositions.

---

## Role 1 — Technical Reference

### Component graph

```
PlantVisualiser
├── Header (icon, title)
├── Capture count badge → CaptureGallery
├── Search + Source filter (Manual / Perenual / AI / All)
├── Plant grid (from Shed)
│   └── Selectable card with thumbnail (SmartImage)
├── Selected plants summary
├── "Choose Plant Icons" button (Continue)
├── SpriteWizardModal (when active)
└── PlantCameraView (when active)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `aiEnabled` | `boolean` | App.tsx | Drives some sprite generation features |

### Local state

| State | Purpose |
|-------|---------|
| `search`, `filterSource` | Plant grid filters |
| `selected` | Set of selected plant ids |
| `showWizard`, `confirmedSprites` | Sprite Wizard state |
| `showCamera`, `showGallery` | Camera / gallery overlays |
| `captureCount`, `captureCountLoading`, `captureCountError`, `captureCountRetry` | Top-bar capture count |
| `fetchError`, `isOpeningWizard` | UI feedback |

### Data flow — read paths

```ts
// Shed plants via useCachedShed hook
useCachedShed(homeId).plants

// Capture count
supabase.from("visualiser_captures")
  .select("id", { count: "exact", head: true })
  .eq("home_id", homeId);
```

### Source badges

| Source | Label | Icon |
|--------|-------|------|
| `api` | Perenual | Database |
| `ai` | AI | Sparkles |
| `manual` | Manual | Edit3 |

### Data flow — write paths

#### Sprite confirm
- `SpriteWizardModal` writes `inventory_items.sprite_url` per plant.

#### Capture save (inside PlantCameraView)
- Composite image uploaded to `visualiser-captures` bucket.
- `visualiser_captures` row inserted with sprite positions.

### Edge functions invoked

- `generate-plant-sprite` (via SpriteWizardModal) — AI-generated sprite for plants without one.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

| Feature | Tier |
|---------|------|
| Pick + camera overlay | Every tier |
| AI sprite generation | Sage / Evergreen (`aiEnabled`) |
| Mobile AR mode | Capacitor native (mobile) — falls back to photo mode on web |

### Beta gating

None.

### Permissions

- `inventory.read` — required for the plant grid.

### Error states

| State | Result |
|-------|--------|
| Shed fetch fails | Retry banner |
| Capture count fetch fails | Top badge in error state with retry |
| Plants fetch fails | Banner |

### Performance

- Plant grid uses cached Shed hook (instant on warm).
- Sprites preloaded as the wizard finishes.
- Capture saved as compressed JPEG via Canvas.

### Linked storage buckets

- `visualiser-captures` — composite output PNGs.
- `plant-sprites` — AI-generated sprite PNGs.

---

## Role 2 — Expert Gardener's Guide

### Why open this tool

Plant Visualiser answers "what will this actually look like in my garden?" Before you dig the hole, drop a sprite of the plant onto a photo of the space. Walk around with your phone in AR mode to see it from multiple angles.

It's also good for show-and-tell — capture the design, share it with family.

### Every flow on this screen

#### 1. Pick plants

- Search box + Source filter (Manual / Perenual / AI / All).
- Tap to select; multi-select supported.

#### 2. Choose Plant Icons

- "Choose Plant Icons" button → `SpriteWizardModal` opens.
- Step 2 subtitle: "Choose how each plant looks in the visualiser".
- Per plant: pick from preset sprites, AI-generate from photo, or upload custom.

#### 3. Camera view

- AR mode (mobile): live camera with sprites overlaid as draggable tokens.
- Photo mode (web / fallback): pick a photo from your library; drop sprites on it.

#### 4. Capture

- Take a snapshot → saved to Capture Gallery.

#### 5. Gallery

- Top-right capture-count badge → opens past captures.
- Each capture has the photo + sprite positions saved.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Source badge | Where the plant came from |
| Plant thumbnail | First image from any provider |
| Selected count | How many plants will be in your composition |
| Sprite | The 2D icon used in the visualiser |
| Capture | Saved composition |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Preset sprites only. |
| Sage / Evergreen | AI-generated sprites from photos. |

### Common mistakes / pitfalls

- **Selecting plants but not assigning sprites.** The Camera view needs sprites — Wizard step is required.
- **AR view shaky on Android.** Some Android browsers don't expose orientation. Capacitor native works better.
- **Captures consume storage.** Periodically prune the Capture Gallery to keep your storage clean.
- **Source filter unclear.** Most users can leave it on "All" — filter is for power users who only want to visualise AI-suggested plants.

### Recommended workflows

- **Pre-buy:** before going to the garden centre, pick the plants you're considering, overlay them on a photo of the bed, see if you like the look.
- **Pre-dig:** before digging, visualise the placement to confirm spacing.
- **Family review:** capture the plan, share via the device share sheet (planned).

### What to do if something looks wrong

- **Sprites floating/jittery in AR:** lower-end phones may struggle. Switch to photo mode.
- **Sprite missing:** plant doesn't have one assigned. Open Wizard.
- **Capture didn't save:** check storage quota in Account → Data Export.

---

## Related reference files

- [Sprite Wizard](./06-sprite-wizard.md)
- [Capture Gallery](../08-modals-and-overlays/31-capture-gallery.md)
- [Plant Camera View](../08-modals-and-overlays/32-plant-camera-view.md)
- [The Shed](../03-garden-hub/01-the-shed.md)

## Code references for ongoing maintenance

- `src/components/PlantVisualiser.tsx` — main screen
- `src/components/SpriteWizardModal.tsx` — sprite assignment
- `src/components/PlantCameraView.tsx` — AR / photo
- `src/components/CaptureGallery.tsx` — past captures
- `src/hooks/useCachedShed.ts` — shed cache hook
- `supabase/functions/generate-plant-sprite/index.ts` — AI sprite
- `supabase/migrations/*_visualiser_captures.sql` — table + bucket policies
