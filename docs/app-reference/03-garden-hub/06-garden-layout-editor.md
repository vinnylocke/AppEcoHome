# Garden Layout Editor

> The full-screen canvas editor where users draw, drag, rotate, resize, and label every shape that makes up their garden. The heart of the spatial system — everything downstream (sun analysis, microclimate, 3D, AR overlay) reads from `garden_shapes`.

**Route:** `/garden-layout/:layoutId`
**Source file:** `src/components/GardenLayoutEditor.tsx` (~2,400 lines)

---

## Quick Summary

A Konva-based 2D editor plus a Three.js-based 3D view (Sage/Evergreen). Shapes are rectangles, ellipses, lines, or polygons. Users can:

- Pick from a sidebar of presets (raised bed, fence, shed, path, pot, tree, pond, etc.).
- Drag, resize, rotate, snap to grid, multi-select with marquee or shift-click.
- Switch between 2D and 3D view (`1` / `2` keys).
- Toggle overlays: sun, lux, companions, frost, wind, pH, moisture — **available in both 2D and 3D** (parity since 2026-07-13). The sun overlay has two modes: **Day** (daily sun-hours classification) and **Live** (lit/shade at the time-slider position).
- Long-press a shape (mobile) or right-click (desktop) → context menu / Quick Actions sheet.
- Link a shape to a Garden Area (so it inherits metrics) and to inventory items (so plant tokens render inside).
- Filter shapes by Plan (planner integration).
- Undo / redo (Ctrl+Z / Ctrl+Shift+Z).

---

## Role 1 — Technical Reference

### Component graph (high level)

```
GardenLayoutEditor (Konva Stage)
├── Header — back, layout name, save state, settings, view toggle (2D/3D)
├── GardenEditorToolbar — interaction modes (move/rotate/draw), undo/redo, snap, zoom
├── GardenShapePanel — preset palette (sidebar / drawer)
├── GardenCompass — north-offset indicator
├── GardenRuler + GardenScaleBar — metric measuring aids
├── Konva Stage (2D)
│   ├── Layer: garden background
│   ├── Layer: shapes (Rect / Ellipse / Line / Polygon per shape_type)
│   ├── Layer: plant tokens (per linked area)
│   ├── Layer: overlay tints (frost/wind/pH/moisture)
│   ├── Layer: sun classification chips
│   ├── Layer: companion lines
│   ├── Layer: alignment guides (drag)
│   ├── Layer: marquee selection rectangle
│   └── Konva Transformer (handles)
├── GardenLayout3D (Three.js — Sage/Evergreen, when viewMode = "3d")
├── GardenShapeProperties — selected-shape inspector (sidebar / bottom sheet)
├── ShapeQuickActions sheet — mobile long-press menu
├── GardenContextMenu — desktop right-click menu
├── PlanFilterChip — plan-scoped view
├── MicroclimateReportModal — opens via toolbar button (Wave 11)
├── GardenNorthSheet — calibrate north via device compass
├── GardenZoneSheet — zone heat-map config
├── BedTemplatesSheet — drop a pre-baked bed template
└── ToolButtons (overlays, settings, save spinner)
```

### Local state — the heavyweights

| State | Purpose |
|-------|---------|
| `layout`, `shapes` | The DB rows for this layout |
| `selectedId`, `extraSelection` | Single + shift-multi selection |
| `tool` | `select / polygon / draw` |
| `interactionMode` | `move / rotate` |
| `pendingPreset` | Preset chosen but not yet drawn |
| `drawStart`, `drawCurrent`, `polyPoints` | In-progress shape geometry |
| `viewMode` | `2d / 3d` |
| `zoom`, `stagePos` | Camera state — refs for pan moves |
| `historyRef` | Past/future arrays of shape snapshots (limit 50) |
| `northOffset`, `homeLatLng` | Sun positioning inputs |
| `sunDate`, `sunMinutes`, `isPlaying` | Sun-time slider state |
| `showLuxOverlay`, `showSunOverlay`, `showCompanionsOverlay`, `showFrostOverlay`, `showWindOverlay`, `showPhOverlay`, `showMoistureOverlay` | Overlay toggles |
| `sunOverlayMode` | `day` (sun-hours classification) / `time` (Live lit-vs-shade at slider time) |
| `activePlanFilter` | Filter shapes by `plan_id` |
| `quickActionsShape`, `contextMenu`, `tokenResize` | Modal-ish UI surfaces |
| `snapToGrid` | 0.5 m grid snap |

### Data flow — read paths

On mount:

```ts
Promise.all([
  supabase.from("garden_layouts").select("*").eq("id", layoutId).single(),
  supabase.from("garden_shapes").select("*").eq("layout_id", layoutId).order("z_index"),
  supabase.from("homes").select("lat,lng").eq("id", homeId).maybeSingle(),
]);
```

Plus on demand:

- `area_lux_readings` (when Lux overlay is on)
- `weather_snapshots` (when Frost overlay is on — pulls 7-day forecast)
- `useShapeLiveState` hook — bulk fetch of plants/tasks/ailments/pH/moisture per linked area

### Data flow — write paths

- **Shape drag/resize/rotate**: debounced patch. On commit the editor pushes the full updated shape into a save queue, then writes to `garden_shapes`. Save state cycles `unsaved → saving → saved`.
- **Bulk save (settings change, etc.)**: deletes all shapes then inserts a fresh set (rare path — used when canvas resize repositions everything).
- **Layout settings (name, canvas dimensions, north offset)**: `garden_layouts` update.
- **Plant token drag (2D)**: `inventory_items.display_x_m / display_y_m` update.
- **Plant token drag (3D)**: same + `display_height_m`.
- **Plant token resize**: `display_size_m / display_height_m`.
- **Home geolocation fallback**: if `homes.lat/lng` is null, browser geolocation prompts and stores into `homes`.

### Edge functions invoked

None directly. The editor is pure CRUD against `garden_shapes` + `inventory_items` + `garden_layouts`.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `sync-areas-to-shapes` | Keeps area `name` / `metrics` mirrored to linked shape labels |
| `sync-weather` + `analyse-weather` | Drives frost/wind overlay data |

### Realtime channels

None directly — saves are explicit. (Could be added in a future "collaborative editing" pass.)

### Tier gating

| Feature | Tier |
|---------|------|
| 2D editor | Every tier |
| 3D view (`2` key, toggle) | **Every tier currently** — gated behind `FeatureGate feature="garden_layout_3d"`, whose entry in `src/constants/tierFeatures.ts` is `ALL` (gates open). Flip that array to `["sage","evergreen"]` to re-restrict. (Doc previously claimed Sage/Evergreen-only — corrected 2026-07-13.) |
| Sun overlay (Day + Live modes) | Every tier (lat/lng required) |
| Frost / Wind / pH / Moisture overlays | Every tier — in both 2D and 3D |
| Microclimate report (full text) | Sage / Evergreen |

### Beta gating

Some Wave-12 features (Bed Templates Sheet, Zone Sheet) ship behind beta flags during rollout — check `useBetaFeedback` for active flags.

### Permissions

- `layout.edit` (via `usePermissions`) — viewers see the editor read-only. All draggable / draw / delete actions are gated.

### Error states

| State | Result |
|-------|--------|
| Save fails | Toast + save state stays `unsaved`. User can retry by interacting again. |
| Load fails | Toast + back to list. |
| Geolocation denied | Sun overlay hidden; user can manually set lat/lng via Account → Home. |
| Token save fails | Toast — position reverts on next refetch. |

### Performance

- Konva Stage uses layers to avoid full redraws on every drag.
- Sun analysis (`computeAllShapesSunHours`) memoised on `[shapes, homeLatLng, sunDate, northOffset]`.
- Live sun mode (`litByShapeId`) memoised on `[shapes, homeLatLng, sunDateObj, northOffset]` — one `isShapeInShadowAt` per shape per slider tick, O(shapes × blockers), trivial.
- Atmospheric tints (`overlayTintByShapeId`) memoised on shapes + toggles + forecast + areaPh + areaMoisture; shared by both views.
- Companion overlay also memoised — only runs when toggled on.
- 3D view lazy-loaded via dynamic import.
- ResizeObserver watches container instead of polling.

### Linked storage buckets

None — shapes are vector geometry stored as DB rows.

### Phone read-only viewer + viewport fixes (2026-07-08)

Per docs/plans/garden-layout-fixes-and-mobile-readonly.md:

- **`viewOnly` mode** — `viewOnly = isMobile` (<768px): the editor becomes a
  viewer. Interaction is forced to LOOK, the toolbar's Row 2 shows a
  view-only banner (`viewonly-banner`), the shape rail / mode strip /
  settings / undo-redo / snap / transformer / properties sheet are all
  hidden, and tapping a shape opens a read-only info card
  (`viewonly-shape-card`: label, size, area link). Pan, zoom, 2D/3D toggle
  and overlay layers stay available.
- **Initial fit-to-canvas (2D)** — `fitStageToCanvas` (`src/lib/layoutViewport.ts`,
  Vitest-covered) picks the zoom/offset that shows the whole canvas centred;
  also powers the `F` shortcut. Previously zoom 1 / (32,32) regardless of
  viewport — phones opened onto a corner of empty grid.
- **3D camera aim** — the Canvas camera is `lookAt`-ed at the canvas centre
  in `onCreated` (position scales with `maxDim`). Without it the default
  camera stared at the ORIGIN until OrbitControls mounted, so in draw/move
  modes the garden sat squashed in the viewport corner.
- **Toolbar wrap** — the desktop toolbar row is `flex-wrap`; in 3D the sun +
  layer controls used to exceed ~1280px and clip off-screen / crush the
  name block (which is now `shrink-0`).
- **`shape_type` CHECK constraint** (migration `20260708120000`) — the
  renderers silently DROP unknown `shape_type` values; the test-account
  seed script wrote `'rectangle'` (not `'rect'`) and every seeded layout
  rendered as an empty 2D canvas while 3D still showed ground + plant
  tokens ("2D doesn't match 3D"). Data repaired + constrained to
  `rect/path/circle/ellipse/polygon`.

### Overlay parity + time-aware sun (2026-07-13)

Per docs/plans/garden-layout-3d-overlay-parity.md:

- **All seven overlays now work in both views.** The frost/wind/pH/moisture
  tint logic was extracted to `src/lib/garden/overlayTints.ts`
  (`getShapeOverlayTint`) — the 2D stage and the 3D scene both read it, so
  the views can't drift. 3D renders the tint as a flat plane per shape
  (same mechanism as the sun overlay); companion lines render as dashed
  three.js `Line`s at y = 0.05.
- **The toolbar's layers group renders in both views** (it was 3D-only,
  which left the 2D-only overlays with no buttons at all). Only the sun
  button needs the home's lat/lng — when missing, that one button is
  replaced by the "Enable location" prompt and the rest stay usable.
- **Sun overlay Day/Live modes** (`sunOverlayMode` state): Day = daily
  classification (unchanged); Live = per-shape lit/shade at the slider
  time via `isShapeInShadowAt`, updating as the slider scrubs or plays.
  The 2D stage also gained a sun tint (it previously computed the
  classification but rendered no tint — only fit badges).
- **Sun date/time controls in 2D** whenever the sun overlay is on
  (previously 3D-only).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is where your garden becomes machine-readable. Every shape you draw is something Rhozly can then reason about — that long rectangle at the south boundary is a wall that casts shade; the four squares in the middle are raised beds you've linked to areas, so they show today's tasks and any ailment severity. Without shapes, the app is a list. With shapes, it's a model.

### Every flow in the editor

#### 1. Draw a shape

- **From a preset**: tap a tile in the Shape Panel (Raised Bed, Path, Tree, Fence, Pot…). Click-drag on canvas to size it; release to commit.
- **Free-form polygon**: pick the polygon tool, click each vertex, double-click to close.
- **Free-form bed (smoothed)**: pick the curved-bed tile — same polygon flow but the resulting shape renders with smooth corners.

#### 2. Edit a shape

- Tap to select. Konva's Transformer shows handles for resize/rotate.
- Drag to move. Alignment guides snap visually when edges align with neighbours.
- Hold and long-press (mobile) → Quick Actions sheet: rename, link to area, duplicate, delete, send to back / bring to front.
- Right-click (desktop) → context menu with the same options.
- Open the properties panel (chevron) to edit: label, color, dashed outline, z-index, extrude height (3D), linked area, plan tag, link to inventory item.

#### 3. Multi-select

- Shift-click multiple shapes.
- Or marquee-drag on empty canvas (desktop).
- With multiple selected: bulk delete (Del), bulk duplicate (Ctrl+D), drag as a group.

#### 4. Toggle 3D view

- Press `2` or tap the toolbar 3D toggle.
- Sage / Evergreen only.
- Plant tokens render as 3D meshes; you can drag them in world space and TransformControls lets you rotate/scale.

#### 5. Toggle overlays

Each overlay tints shapes by a different signal. **All overlays work in both 2D and 3D** — in 2D as Konva tint rects, in 3D as flat tinted planes on each shape (both read the same shared tint helper, `src/lib/garden/overlayTints.ts`, so the views can never disagree):

| Overlay | Tint colour | Meaning |
|---------|-------------|---------|
| Sun — Day mode | Classification palette (yellow→slate) | Hours of direct sun for the chosen date |
| Sun — Live mode | Yellow = lit, slate = shaded | Whether the shape is lit at the time-slider position |
| Lux | Badge (3D) | `area_lux_readings.lux` within ±30 min of the slider time |
| Companions | Dashed lines between shapes | Beneficial = green, harmful = red |
| Frost | Blue→red bands | Worst overnight low across the 7-day forecast |
| Wind | Red gradient | Wind exposure score |
| pH | Red→blue | Acidic vs alkaline (`areas.medium_ph`) |
| Moisture | Yellow→blue | Dry vs saturated (latest soil-sensor reading) |

One tint at a time: the sun overlay wins over the atmospheric tints, and the atmospheric tints resolve in fixed priority frost > wind > pH > moisture.

#### 6. Sun-time slider + Day/Live mode

- The date + time slider appears in 3D always, and in 2D whenever the sun overlay is on.
- The sun azimuth updates live; scene lighting/shadows in 3D follow.
- Tap play to animate dawn → dusk.
- With the sun overlay on, a **Day / Live** switch appears next to the Sun button. *Day* tints by total sun-hours for the chosen date; *Live* re-tints every shape lit/shaded as you scrub the slider (uses `isShapeInShadowAt` from `src/lib/sunAnalysis.ts`).

#### 7. Link a shape to an Area

- Open properties panel → "Linked Area" dropdown.
- Picking an area binds the shape: plant tokens for that area's inventory appear inside; ailment severity ring shows; task indicator dot shows if today has tasks for this area.

#### 8. Link a shape to a Plan (planner)

- Properties panel → "Plan" field.
- The Planner can "View on Layout" to filter visibility to just shapes belonging to a plan.

#### 9. North calibration

- Tap the compass → opens `GardenNorthSheet`.
- "Hold your device flat and face north" → the device gyroscope sets `north_offset_deg`.
- Critical for sun analysis to match reality.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Save state pip | `Saved` / `Saving…` / `Unsaved` |
| Zoom % | Camera zoom — 1 metre = 50 pixels at 100% |
| Pan handles | Drag empty canvas to pan |
| Selection handles | 8 resize + 1 rotate handle |
| Shape z-index | Stacking order — higher = on top |
| Extrude (3D) | Height in metres in 3D view |
| Dashed outline | Marks a "planned" shape vs a built one — default for garden boundary |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | 2D + 3D (the `garden_layout_3d` gate is currently open to all tiers). All overlays available in both views. |
| Sage / Evergreen | Same, plus Microclimate report unlocked and AI in sun analysis. |

### Common mistakes / pitfalls

- **Drawing without linking to an area.** Shape exists but doesn't inherit metrics or show tokens. Always link via properties → Linked Area.
- **Not calibrating north.** Sun analysis runs against north = up by default. If your house faces south-west, all shadows are wrong until you calibrate.
- **Drawing the canvas way bigger than the garden.** Wastes space — canvas dimensions live in Settings and can be re-sized.
- **Overlay stacking confusion.** Only one tint shows at a time — sun beats the atmospheric overlays, and those resolve frost > wind > pH > moisture. Use one at a time for clarity.
- **Forgetting to save before closing.** Save state stays `unsaved` if the debounce is in flight — wait for `Saved` before navigating.
- **Trying to edit on a phone.** Phones show the layout view-only — pan, zoom, switch 2D/3D and tap shapes for details, but drawing and editing need a tablet or computer (the tools genuinely don't fit a small screen).

### Recommended workflows

- **Initial setup:** draw the boundary, calibrate north, then add fences/hedges. Sun overlay → see where the shade falls. Place beds in the sunniest zones.
- **Planning a new bed:** pick the Raised Bed preset, draw, link to a new area, tag with your Plan.
- **Mid-season check:** open editor → toggle Sun + Frost + pH overlays in sequence → spot any plants in the wrong zone.

### What to do if something looks wrong

- **Sun shadows look wrong:** recalibrate north.
- **Plant tokens missing:** the shape isn't linked to the area, or the inventory item's area doesn't match.
- **3D view blank:** check the `garden_layout_3d` feature gate (currently open to all tiers in `tierFeatures.ts`; if it has been flipped to Sage/Evergreen, lower tiers see a paywall).
- **An overlay button does nothing:** most overlays need data — pH needs `areas.medium_ph` on the linked area, moisture needs a soil sensor with a reading in the last 24 h, lux needs a light-sensor reading within ±30 min of the slider time, frost needs a weather snapshot, and sun needs the home's lat/lng.
- **Save spinning forever:** check toast — if a network error, retry will fire on next interaction.

---

## Related reference files

- [Garden Layout List](./05-garden-layout-list.md)
- [Microclimate Report](./07-microclimate-report.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [Garden Shapes (cross-cutting)](../99-cross-cutting/14-garden-shapes.md)
- [Sun Analysis (cross-cutting)](../99-cross-cutting/15-sun-analysis.md)

## Code references for ongoing maintenance

- `src/components/GardenLayoutEditor.tsx` — main editor
- `src/components/GardenLayout3D.tsx` — Three.js 3D view
- `src/components/GardenShapePanel.tsx` — preset palette
- `src/components/GardenShapeProperties.tsx` — inspector
- `src/components/GardenEditorToolbar.tsx` — top toolbar
- `src/components/garden/` — extracted sub-sheets (Quick Actions, Context Menu, Bed Templates, etc.)
- `src/lib/garden/` — pure geometry/utility code (alignment guides, plant tokens, microclimate, sun fit)
- `src/lib/garden/overlayTints.ts` — shared 2D/3D overlay tint logic (frost/wind/pH/moisture bands, Live sun tints, hex-alpha splitting)
- `src/lib/sunAnalysis.ts` — heavy sun-hours computation
- `src/hooks/useShapeLiveState.ts` — bulk fetch of plants/tasks/ailments/pH/moisture per area
- `src/hooks/useSunPosition.ts` — SunCalc wrapper
