# Plan — Garden Layout Feature: Deep Audit & Overhaul

## Goal

Take the garden layout feature from its current state (rated below, currently jarring on phone and visually CAD-like) up to a **rating of ≥90/100** across usability, simplicity, and aesthetics, on both **PC and phone**.

The target user is the same persona the app is built for: an amateur gardener who wants to sketch their plot quickly, see it look like a garden (not a wireframe), and use the result both on a desktop while planning and on their phone while standing in the garden.

---

## Files Audited

| File | Lines | Role |
|------|-------|------|
| `src/components/GardenLayoutList.tsx` | 779 | Layout list + "Blank Canvas" / "Garden Builder" 3-step wizard |
| `src/components/GardenLayoutEditor.tsx` | 1349 | God-file editor — toolbar, canvas, modes, settings, sun |
| `src/components/GardenLayout3D.tsx` | 298 | three.js scene (camera, lighting, sun, ground, gizmo) |
| `src/components/GardenShape3D.tsx` | 268 | Per-shape 3D mesh (rect/circle/ellipse/polygon/tree canopy) |
| `src/components/GardenShapePanel.tsx` | 168 | Shape preset rail (side on PC, scrollable strip on mobile) |
| `src/components/GardenShapeProperties.tsx` | 297 | Right sidebar / bottom sheet — label/colour/size/etc. |
| `src/components/GardenRuler.tsx` | 108 | Grid lines + ruler labels on Konva stage |
| `src/components/GardenCompass.tsx` | 102 | Draggable north arrow |
| `src/components/GardenScaleBar.tsx` | 25 | Bottom-right scale indicator |

---

## Rating Criteria (32 criteria, weighted)

Each criterion is scored 1–5. Weighted sum normalised to 100.

### Usability — 8 criteria, weight 1.5× each
| # | Criterion | What it measures |
|---|-----------|------------------|
| U1 | **Mode clarity** | Are the Draw / Move / View modes immediately understandable? |
| U2 | **Tool affordance** | When a tool is active, is it obvious what to do next? |
| U3 | **Error recovery** | Undo, cancel, escape — are they present and discoverable? |
| U4 | **Direct manipulation** | Can the user drag/rotate/resize shapes directly, or are text inputs forced? |
| U5 | **Feedback** | Visual response on hover, tap, drag, save? |
| U6 | **Touch targets** | Buttons ≥44px on mobile, no fat-finger overlaps? |
| U7 | **Save model** | Is auto-save clear; can users trust it; can they leave and return? |
| U8 | **Real-world calibration** | Compass + north + scale — is mapping the canvas to real space practical? |

### Simplicity — 7 criteria, weight 1.5× each
| # | Criterion | What it measures |
|---|-----------|------------------|
| S1 | **Onboarding friction** | First-time user time-to-first-shape |
| S2 | **Concept count** | How many simultaneous concepts (tool, mode, view, layer, preset…) |
| S3 | **Default suitability** | Do defaults Just Work for a typical garden? |
| S4 | **Wizard quality** | Does the "Garden Builder" wizard actually save time? |
| S5 | **Settings depth** | Are advanced controls hidden behind sensible defaults? |
| S6 | **Visual decision aids** | Does the UI tell you which preset is which without reading labels? |
| S7 | **Cognitive overload** | Is the toolbar/sidebar/properties combination tolerable? |

### Aesthetics — 9 criteria, weight 1.5× each
| # | Criterion | What it measures |
|---|-----------|------------------|
| A1 | **2D shape realism** | Do 2D shapes look like beds/paths/plants vs. flat blocks? |
| A2 | **3D shape realism** | Do 3D shapes look like garden objects vs. CAD primitives? |
| A3 | **Ground texture** | Does the canvas/ground feel like soil/grass vs. a flat colour fill? |
| A4 | **Materials** | Are fence/wall/water/hedge/paving visually distinct? |
| A5 | **Organic shape vocabulary** | Can users make wavy borders, free-form hedges, mulch patches? |
| A6 | **Colour palette** | Is the palette garden-natural (greens, browns, terracotta, stone) vs. crayon? |
| A7 | **Iconography & typography** | Are shape-rail icons distinct and on-brand; are labels balanced? |
| A8 | **Lighting & shadows** | Does 3D have convincing shadowing & sun behaviour? |
| A9 | **Empty-state quality** | Is the blank canvas inviting vs. intimidating? |

### Mobile-specific — 4 criteria, weight 2× each
| # | Criterion | What it measures |
|---|-----------|------------------|
| M1 | **Toolbar fit** | Top toolbar visible without horizontal scroll on common phones |
| M2 | **Canvas real estate** | When properties or shape rail are open, can the user still see the garden? |
| M3 | **One-handed reach** | Are primary actions reachable with one thumb? |
| M4 | **Gestures** | Pinch-zoom, two-finger pan, drag — do they feel native and unambiguous? |

### PC-specific — 4 criteria, weight 1× each
| # | Criterion | What it measures |
|---|-----------|------------------|
| P1 | **Keyboard shortcuts** | Are common ops (delete, duplicate, undo, fit, escape) keyboarded? |
| P2 | **Multi-select** | Can you operate on multiple shapes at once? |
| P3 | **Right-click context** | Contextual menu for shape ops? |
| P4 | **Window resizing** | Does layout reflow gracefully from narrow to wide? |

### Integration with rest of app — 9 criteria, weight 2× each
*The layout is the natural "spatial canvas" for the whole app. Plants live somewhere. Tasks happen somewhere. Ailments break out somewhere. A bed isn't just a coloured rectangle — it's an area-of-attention with state.*

| # | Criterion | What it measures |
|---|-----------|------------------|
| I1 | **Plants visible on map** | Can you see *which plants* live in each bed at a glance? |
| I2 | **Task awareness** | Does the map show which beds need attention today / are overdue? |
| I3 | **Ailment awareness** | Are active pest/disease outbreaks visible on the affected shape? |
| I4 | **Plan integration** | Can you filter the layout by Planner project ("show me the Spring Veggie Plan")? |
| I5 | **Quick actions from map** | One-tap "watered this bed", "pruned this", "harvested this" without going to a task list? |
| I6 | **Smart suggestions** | AI suggestions for what to plant here given sun/lux/pH/season? Companion planting hints? |
| I7 | **Notes & history** | Per-shape notes; crop rotation history; "what was here last year"? |
| I8 | **Atmospheric layers** | Sun / lux / moisture / pH / wind / frost overlays — microclimate analysis? |
| I9 | **Templates & reuse** | Can you save a configured bed as a reusable template? Starter layouts? |

**Weighted total**: 8×1.5 + 7×1.5 + 9×1.5 + 4×2 + 4×1 + 9×2 = 12 + 10.5 + 13.5 + 8 + 4 + 18 = **66 weighted units**.
Normalised to 100: score = (raw / (66 × 5)) × 100 = raw / 3.3.

---

## Current State Rating

| # | Criterion | Score (1–5) | Note |
|---|-----------|------|------|
| U1 | Mode clarity | **2** | "Draw / Move / View" trio confusing — "View" pans canvas (Eye icon suggests look only); "Move" actually = select + drag |
| U2 | Tool affordance | **3** | Top banner shows "click and drag to place" — helpful — but draw vs polygon flow inconsistent |
| U3 | Error recovery | **2** | No undo/redo, no Ctrl+Z. ESC cancels draw/polygon but undiscoverable. |
| U4 | Direct manipulation | **4** | 2D Konva transformer is good; 3D TransformControls work for translate |
| U5 | Feedback | **3** | Save state pill is tiny tracking-widest text; tap states OK; no ghost on touch |
| U6 | Touch targets | **2** | Toolbar mode/view buttons ~28px; zoom +/-, settings cog ~28-32px |
| U7 | Save model | **4** | 600ms debounce auto-save works well; "Saved/Saving/Unsaved" indicator is clear |
| U8 | Real-world calibration | **3** | Compass + phone-compass calibration is clever but buried in settings modal |
| S1 | Onboarding friction | **2** | New user faces blank canvas + 16 preset shapes + 3 modes — no guided first-shape flow |
| S2 | Concept count | **2** | tool (select/polygon/draw) + interactionMode (draw/move/rotate) + viewMode (2D/3D) + preset + layer + area-link — overlapping vocabulary |
| S3 | Default suitability | **3** | 30m×20m default canvas is sensible; default shape sizes reasonable |
| S4 | Wizard quality | **3** | 3-step builder works; only rect/square/L-shape; no curved/freeform; borders applied once and not re-editable here |
| S5 | Settings depth | **2** | Canvas settings modal mixes name + size + orientation + compass calibration in one dense scroll |
| S6 | Visual decision aids | **2** | Shape icons are tiny coloured outlines — raised-bed vs path vs greenhouse look near-identical |
| S7 | Cognitive overload | **2** | Toolbar carries 9 control groups simultaneously |
| A1 | 2D shape realism | **1** | Pure flat colour rectangles with rounded corners — looks like a 1990s CAD floor plan |
| A2 | 3D shape realism | **2** | Boxes are boxes, cylinders are cylinders; no plant models, no realistic raised-bed wood texture, no greenhouse panes |
| A3 | Ground texture | **2** | 2D: white-ish stage background; 3D: solid `#c8e6c9` plane. No grass, soil, or terrain. |
| A4 | Materials | **2** | All shapes use `meshLambertMaterial` with their hex colour; pond gets phong + transparency; nothing else distinct |
| A5 | Organic shape vocabulary | **2** | Only rect/circle/ellipse/polygon. Polygon is sharp-cornered. No spline/bezier curves, no organic mulch patches |
| A6 | Colour palette | **3** | Reasonable greens/browns/blues but flat. 8 swatches feel like crayons; no themed presets (soil, foliage, hardscape, water) |
| A7 | Iconography & typography | **3** | Icons OK but tiny; label tracking-widest at 9-10px hurts readability |
| A8 | Lighting & shadows | **4** | SunCalc + directional light + shadow maps — actually pretty good |
| A9 | Empty-state quality | **2** | List shows "No layouts yet — Create your first layout"; editor opens to blank green-ish field with no guide |
| M1 | Toolbar fit | **1** | At 375px the toolbar has 9 control groups in `overflow-x-auto`; users must scroll to find save/zoom/settings |
| M2 | Canvas real estate | **2** | Bottom shape rail (≈80px) + 55vh properties sheet leaves ~25% of screen for canvas when both are open |
| M3 | One-handed reach | **2** | Settings cog is far-right of horizontally-scrolled toolbar; bottom rail is reachable but properties sheet covers top half |
| M4 | Gestures | **3** | Pinch-zoom + single-finger pan in "rotate" mode work; but pan locked to one mode is non-obvious |
| P1 | Keyboard shortcuts | **1** | Only ESC. No undo, no delete, no duplicate, no fit-to-view |
| P2 | Multi-select | **1** | None — one shape at a time |
| P3 | Right-click context | **1** | None |
| P4 | Window resizing | **4** | ResizeObserver + isMobile breakpoint at 768 — reflows cleanly |
| I1 | Plants visible on map | **1** | 3D shows a tiny floating text card per linked area with up to 3 plant names. 2D shows nothing. No visual icons. |
| I2 | Task awareness | **1** | Layout has zero awareness of tasks. Pending/overdue tasks live in TaskList, never on the map |
| I3 | Ailment awareness | **1** | Ailment Watchlist has no link to layout shapes |
| I4 | Plan integration | **1** | Planner is unaware of layouts; layouts are unaware of plans |
| I5 | Quick actions from map | **1** | Tap a shape → properties panel only. No "watered ✓", no "harvested", no quick complete |
| I6 | Smart suggestions | **1** | Sun classification exists but nothing suggests *plants*. No companion planting hints. No "best plants for this bed" |
| I7 | Notes & history | **1** | No per-shape notes. No crop rotation tracking. No "what was here last year" |
| I8 | Atmospheric layers | **3** | Sun classification + Lux overlays exist. Missing moisture, pH, wind, frost |
| I9 | Templates & reuse | **1** | No way to save a configured bed as a template. Layout list is per-home only |

### Weighted Total

Usability: U1×1.5 + … = (2+3+2+4+3+2+4+3) × 1.5 = 23 × 1.5 = **34.5**
Simplicity: (2+2+3+3+2+2+2) × 1.5 = 16 × 1.5 = **24.0**
Aesthetics: (1+2+2+2+2+3+3+4+2) × 1.5 = 21 × 1.5 = **31.5**
Mobile: (1+2+2+3) × 2 = 8 × 2 = **16.0**
PC: (1+1+1+4) × 1 = 7 × 1 = **7.0**
Integration: (1+1+1+1+1+1+1+3+1) × 2 = 11 × 2 = **22.0**

**Raw total: 135.0 / 330 → Normalised: 41/100**

Adding the integration dimension dropped the score from 47 to 41 — that's the point: the original score was flattering because it ignored the most valuable axis. The feature is decent at *drawing shapes* and bad at *being part of the app*.

---

## Target

**≥ 90/100** weighted. To get there we need to raise:
- Integration from 22 → ~80 (single biggest lever — the feature is currently isolated from the rest of the app)
- Aesthetics from 31.5 → ~58
- Mobile from 16 → ~36 (biggest UX blocker today)
- Usability from 34.5 → ~52
- Simplicity from 24 → ~45
- PC from 7 → ~15

Concrete targets per criterion are in the table at the bottom.

---

## Persona Expectations

The plan above (Waves 1–6) makes the layout *easier and prettier*. But neither persona's job is "make a pretty drawing" — both want a working garden. The layout has to integrate with what's already in the app: Plants (The Shed), Tasks (Blueprints), Ailment Watchlist, Planner, Plant Doctor, Weather, Integrations.

### Sarah — new amateur gardener
- "I just planted three tomato seedlings. Where do they live? Can I drop them onto the right bed and have the app remember?"
- "Which beds need watering today? Show me on the map, not in a list."
- "I've got an empty patch — what should I grow there? My garden gets a few hours of sun."
- "I took a photo of one of my plants last week. Can I see it next to the bed it's in?"
- "I had aphids on my roses — has it spread? Where else should I check?"
- "I'm following a 'Spring Veggie Bed' plan from the Planner. Show me only those shapes."

### Marcus — pro / experienced gardener
- "What did I plant in this bed last year? Two years ago? I don't want to rotate brassicas back too soon."
- "These two beds are next to each other — are the plants compatible?"
- "I want a heatmap of soil pH across my whole plot."
- "Save this bed (raised, 2×1m, with rosemary + sage + thyme) as a template — I'll add 4 more like it on my allotment."
- "Tell me which beds are frost-pocket risks tonight based on the forecast."
- "I want to schedule my smart sprinkler to water just this zone."
- "Notes per bed: 'gets waterlogged after heavy rain — needs better drainage'."

**Almost everything both personas want is already represented elsewhere in the app — it just isn't surfaced on the layout.** Waves 7–11 below close that gap.

---

## Overhaul Plan — 6 Waves

Each wave is independently deployable. Re-rate after each wave; don't start the next until the previous targets are hit.

### Wave 1 — Mobile-first toolbar & layout (Mobile + Usability)
*Biggest single ROI: the editor is currently broken-feeling on phone.*

#### 1A. Collapse the toolbar to two rows on mobile
- **Row 1 (always visible)**: back, layout name (truncated), save state (icon-only on phone)
- **Row 2 (mode strip)**: Draw / Edit / Look — three big segmented buttons spanning full width
- Zoom, sun, lux, settings move to a **floating action bubble** on the canvas (bottom-right, just above the shape rail)
- **File**: `src/components/GardenLayoutEditor.tsx` (split the toolbar JSX into `<GardenEditorToolbar>` sub-component to escape the god file)

#### 1B. Rename and rework interaction modes
- "Draw" → **Draw** (Pencil icon) — pick a shape from rail, drag on canvas
- "Move" → **Edit** (CursorMove icon) — tap to select, drag to move, handles to resize/rotate
- "View" → **Look** (Hand icon) — pan + zoom only, no selection
- Description shown under mode strip while active: "Tap a shape, then drag to move" etc.
- **File**: same as 1A

#### 1C. Convert properties bottom sheet to a 3-step drawer
- Today: 55vh single sheet with 7+ groups stacked — overwhelming
- New: short sheet (~28vh) with **3 inline tabs**: "Style" (label, colour, swatches), "Size" (W/H/Radius/Rotate), "Link" (area, layer order, delete)
- Drag-handle on the sheet to expand to ~70vh if user wants more room
- **File**: `src/components/GardenShapeProperties.tsx`

#### 1D. Shape rail polish
- Bigger preset tiles on mobile (64px tall), bigger icons, label below
- Group rail into sections via faint dividers: **Plants** (beds, planters, pots) | **Structures** (greenhouse, shed) | **Hardscape** (path, wall, fence, gate) | **Features** (pond, tree)
- **File**: `src/components/GardenShapePanel.tsx`

#### 1E. Touch target audit
- Min 44×44 for every button on mobile
- Increase save indicator, mode buttons, settings cog
- **File**: `src/components/GardenLayoutEditor.tsx`

**Wave 1 targets**: M1 → 4, M2 → 4, M3 → 4, U1 → 4, U6 → 4, S7 → 3.

---

### Wave 2 — Visual overhaul: 2D map aesthetic (Aesthetics)
*The 2D view currently looks like a CAD diagram. We're making it look like a garden plan.*

#### 2A. Textured ground & background
- Replace the white Konva stage with a **soft soil-toned background** (warm cream gradient with a subtle paper-grain texture, applied as a fullscreen `<Rect>` with a pattern fill or repeat-image)
- Add a faint **grass texture pattern** to anywhere not occupied by a shape — implemented as the default background under the canvas border
- **File**: `src/components/GardenRuler.tsx` (canvas border component) + new `src/components/GardenStageBackground.tsx`

#### 2B. Material-aware shape fills (2D)
- Each preset gets a **fill style**, not just a colour:
  - Raised bed: soil-brown with a subtle hatched wood-frame border drawn as 4 inner strokes
  - Planter box: terracotta with a curved highlight
  - Pond: blue gradient + faint ripple lines drawn as 3 thin wavy strokes
  - Path: light-stone with a recurring "stone" pattern (small irregular polygons)
  - Greenhouse: pale-blue glass with a cross-frame overlay
  - Tree canopy: layered green circles (small dots clustered) + canopy outline
  - Hedge: tight zig-zag border representing foliage
  - Fence: short vertical "plank" lines along the length
  - Wall: solid grey with shadow drop
  - Grass area: light green with random "grass blade" tick marks
- All implemented via Konva groups with the base shape + decorative children
- **New file**: `src/components/garden/shapeStyles.ts` — exports `renderShape2D(shape, isSelected): React.ReactNode`
- **File**: `src/components/GardenLayoutEditor.tsx` — replace `renderShape` with `renderShape2D`

#### 2C. Plant tokens in 2D
- When a shape has linked plants (via `area_id`), render small **plant icon tokens** (simple top-down silhouette circles in plant-themed greens) inside the shape's bounding area
- Up to 5 visible, then "+N" pill
- **File**: `src/components/garden/shapeStyles.ts`

#### 2D. Soft drop shadows
- Every solid shape (not dashed boundaries) gets a 2-3px blurred shadow offset (Konva `shadowBlur` + `shadowOffsetY` + `shadowColor`)
- Selected: brighter outline + slightly stronger shadow (z-lift effect)
- **File**: `src/components/garden/shapeStyles.ts`

#### 2E. Themed colour palettes
- Replace the 8 random swatches with **4 themed palettes** the user can tap between:
  - **Foliage**: 6 greens — lime, mint, sage, fern, emerald, forest
  - **Hardscape**: 6 neutrals — stone, slate, terracotta, brick, sand, charcoal
  - **Water**: 4 blues — pond, turquoise, deep, lagoon
  - **Accents**: 6 — coral, mustard, lavender, plum, ochre, peach
- Each palette is a labelled chip group; custom colour-picker remains as a final option
- **File**: `src/components/GardenShapeProperties.tsx`

**Wave 2 targets**: A1 → 4, A3 → 4, A4 → 4, A6 → 4, A7 → 4, A9 → 3.

---

### Wave 3 — 3D realism (Aesthetics)

#### 3A. Ground texture (3D)
- Replace flat `#c8e6c9` plane with a **tiling grass texture** (use a procedural noise texture or a small repeat-grass PNG from `/public`)
- Optional terrain micro-noise for non-billiard-table feel (subtle vertex displacement)
- **File**: `src/components/GardenLayout3D.tsx`

#### 3B. Material library
- New `src/lib/garden3DMaterials.ts` exports a `getMaterial(presetId)` returning a properly-configured material:
  - Wood (raised-bed frame): brown `meshStandardMaterial` with roughness 0.7
  - Stone (path/wall): grey textured material
  - Glass (greenhouse): transparent `meshPhysicalMaterial` with low roughness + transmission
  - Water (pond): `meshPhysicalMaterial` with high transmission + IOR ~1.33 + clearcoat
  - Soil (raised bed interior): rich brown with high roughness
  - Foliage (tree canopy, hedge): emissive-tint green for richness
- **File**: `src/components/GardenShape3D.tsx` — swap inline materials for `getMaterial(shape.preset_id)`

#### 3C. Better 3D primitives
- **Raised bed**: render as a hollow rectangular frame (4 wooden plank meshes) + soil-filled interior plane, not a solid box
- **Greenhouse**: framed structure with translucent glass panels (BoxGeometry walls + a transparent material; cross-strut visible)
- **Tree canopy**: replace single sphere with 3 overlapping irregular spheres (cluster) + a trunk cylinder
- **Hedge**: tall extruded shape with displaced top edge to break the flat-top look
- **Pond**: thin disc with a higher water plane material; ripple normal map if perf allows
- **Path**: very thin slab + repeat stone texture along length
- **File**: `src/components/GardenShape3D.tsx`

#### 3D. Skybox & atmosphere
- Replace solid `skyColor` with a soft 2-stop gradient sky (top → horizon) using a small skybox sphere or `<Sky>` from drei
- Fog at distance to soften canvas edges
- **File**: `src/components/GardenLayout3D.tsx`

**Wave 3 targets**: A2 → 4, A3 → 5, A4 → 5, A8 → 5.

---

### Wave 4 — Organic shapes & onboarding (Simplicity + Aesthetics)

#### 4A. Curve / freeform drawing tool
- Add a **"Curve"** drawing mode alongside the existing polygon: tap to drop points, drops a smooth Catmull-Rom curve through them (using `Line.tension={0.5}` in Konva or a smoothed point array)
- Useful for wavy borders, organic mulch patches, irregular flower beds
- New entry in the shape rail: "Free-form Bed" (curve)
- **Files**: `src/components/GardenLayoutEditor.tsx` (new tool state), `src/components/GardenShapePanel.tsx` (rail entry)

#### 4B. Garden Builder wizard — expanded
- Add shape options: rectangle, square, L-shape, **T-shape**, **trapezoid**, **freeform** (lets user tap points on a small grid)
- Optional starting beds: "Add 2 raised beds along the back fence" toggle
- **File**: `src/components/GardenLayoutList.tsx` (builder wizard)

#### 4C. First-shape coach mark
- When editor opens with zero shapes, show a centered semi-translucent overlay: "Tap a shape on the left/bottom to start drawing your garden" with arrow pointing to shape rail; dismiss on first preset tap
- **File**: `src/components/GardenLayoutEditor.tsx`

#### 4D. Sensible defaults
- New layout defaults to a **3 × 4 m** "Starter Garden" rather than the existing 30 × 20 m blank — less intimidating
- Builder wizard pre-fills 4 × 3 m and a "Choose later" option
- **Files**: `src/components/GardenLayoutList.tsx`, DB migration to default `canvas_w_m` if needed

**Wave 4 targets**: S1 → 4, S3 → 4, S6 → 4, A5 → 4, A9 → 4.

---

### Wave 5 — Power & polish (Usability + PC)

#### 5A. Undo / Redo
- Local undo stack (array of `ShapeData[]` snapshots) capped at 50 entries
- Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z; on mobile, an undo button in the bottom-floating action bubble
- **File**: `src/components/GardenLayoutEditor.tsx` — new `useHistory` hook in `src/hooks/`

#### 5B. Keyboard shortcuts
- `Delete` / `Backspace` → delete selected
- `Ctrl+D` → duplicate
- `Ctrl+A` → select all (groundwork for multi-select)
- `F` → fit canvas to view
- `1` / `2` → 2D / 3D toggle
- `Esc` → deselect + cancel any active tool
- Show shortcuts in a `?` hover overlay (desktop only)
- **File**: `src/components/GardenLayoutEditor.tsx`

#### 5C. Multi-select (PC primarily)
- Shift-click to add to selection
- Drag-select rectangle on empty canvas in Edit mode
- Group operations: delete-all, move-all, align (left/center/right/top/middle/bottom)
- **File**: `src/components/GardenLayoutEditor.tsx`

#### 5D. Right-click context menu (PC)
- On a shape: duplicate / delete / bring to front / send to back / link to area
- On canvas: paste / select all / fit to view
- **New file**: `src/components/GardenContextMenu.tsx`

#### 5E. Snap-to-grid & guides
- Optional grid snap (toggle in toolbar): 0.25 m / 0.5 m / 1 m / off
- Smart guides: when dragging, show alignment lines when the dragged shape's centre/edge aligns with another's
- **File**: `src/components/GardenLayoutEditor.tsx`

**Wave 5 targets**: U3 → 5, U4 → 5, P1 → 5, P2 → 4, P3 → 4.

---

### Wave 6 — Simplicity & calibration (Simplicity)

#### 6A. Always-visible measurements
- Every shape's bounding-box dimensions shown as faint inline text labels (e.g. "2.0 × 1.0 m") when zoom ≥ 0.6×
- **File**: `src/components/garden/shapeStyles.ts`

#### 6B. Pull compass out of settings modal
- North orientation set via a small inline compass affordance in the toolbar (or canvas overlay) — tap it to open a focused "Set North" sheet rather than the full canvas-settings modal
- The phone-compass "Read Now" feature surfaces as a quick action in that sheet
- **File**: `src/components/GardenLayoutEditor.tsx` (toolbar + new `src/components/GardenNorthSheet.tsx`)

#### 6C. Canvas-settings declutter
- Split the settings modal into focused sub-sheets: Name & Size · Orientation · (future) Sharing
- Each opens from a one-tap entry in the toolbar's settings menu
- **File**: `src/components/GardenLayoutEditor.tsx`

#### 6D. Shape preset preview tooltips
- Hover (desktop) / long-press (mobile) on a preset shows a larger preview image + one-line description
- **File**: `src/components/GardenShapePanel.tsx`

**Wave 6 targets**: S2 → 4, S4 → 4, S5 → 4, U8 → 5, U2 → 4.

---

## Re-rating Target After All Waves

| Criterion | Current | After W1–6 | After W1–11 | After W1–12 |
|-----------|--------:|-----------:|------------:|------------:|
| U1 Mode clarity | 2 | 4 | 4 | 5 |
| U2 Tool affordance | 3 | 4 | 4 | 4 |
| U3 Error recovery | 2 | 5 | 5 | 5 |
| U4 Direct manipulation | 4 | 5 | 5 | 5 |
| U5 Feedback | 3 | 4 | 5 | 5 |
| U6 Touch targets | 2 | 4 | 4 | 4 |
| U7 Save model | 4 | 5 | 5 | 5 |
| U8 Calibration | 3 | 5 | 5 | 5 |
| S1 Onboarding | 2 | 4 | 4 | 5 |
| S2 Concept count | 2 | 4 | 4 | 4 |
| S3 Defaults | 3 | 4 | 4 | 4 |
| S4 Wizard | 3 | 4 | 4 | 5 |
| S5 Settings depth | 2 | 4 | 4 | 4 |
| S6 Visual decision aids | 2 | 4 | 5 | 5 |
| S7 Cognitive overload | 2 | 4 | 4 | 4 |
| A1 2D realism | 1 | 4 | 4 | 5 |
| A2 3D realism | 2 | 4 | 4 | 4 |
| A3 Ground texture | 2 | 5 | 5 | 5 |
| A4 Materials | 2 | 5 | 5 | 5 |
| A5 Organic shapes | 2 | 4 | 4 | 4 |
| A6 Palette | 3 | 4 | 4 | 4 |
| A7 Icons/type | 3 | 4 | 4 | 4 |
| A8 Lighting | 4 | 5 | 5 | 5 |
| A9 Empty state | 2 | 4 | 5 | 5 |
| M1 Toolbar fit | 1 | 4 | 4 | 4 |
| M2 Canvas real estate | 2 | 4 | 4 | 4 |
| M3 One-handed reach | 2 | 4 | 5 | 5 |
| M4 Gestures | 3 | 4 | 4 | 4 |
| P1 Shortcuts | 1 | 5 | 5 | 5 |
| P2 Multi-select | 1 | 4 | 4 | 5 |
| P3 Right-click | 1 | 4 | 4 | 5 |
| P4 Resizing | 4 | 5 | 5 | 5 |
| I1 Plants on map | 1 | 1 | 5 | 5 |
| I2 Task awareness | 1 | 1 | 5 | 5 |
| I3 Ailment awareness | 1 | 1 | 4 | 4 |
| I4 Plan integration | 1 | 1 | 5 | 5 |
| I5 Quick actions | 1 | 1 | 5 | 5 |
| I6 Smart suggestions | 1 | 1 | 5 | 5 |
| I7 Notes & history | 1 | 1 | 5 | 5 |
| I8 Atmospheric layers | 3 | 3 | 5 | 5 |
| I9 Templates | 1 | 1 | 5 | 5 |

### Projected weighted totals

**After Waves 1–6 only** (visual/UX overhaul, no integration):
- Usability: 36 × 1.5 = **54.0**
- Simplicity: 28 × 1.5 = **42.0**
- Aesthetics: 39 × 1.5 = **58.5**
- Mobile: 16 × 2 = **32.0**
- PC: 18 × 1 = **18.0**
- Integration (unchanged): 11 × 2 = **22.0**
- **Raw total: 226.5 / 330 → 69/100** — feature looks better but is still isolated. Falls short of the 90 target.

**After Waves 1–11** (integration added):
- Usability: (4+4+5+5+5+4+5+5) × 1.5 = 37 × 1.5 = **55.5**
- Simplicity: (4+4+4+4+4+5+4) × 1.5 = 29 × 1.5 = **43.5**
- Aesthetics: (4+4+5+5+4+4+4+5+5) × 1.5 = 40 × 1.5 = **60.0**
- Mobile: (4+4+5+4) × 2 = 17 × 2 = **34.0**
- PC: (5+4+4+5) × 1 = 18 × 1 = **18.0**
- Integration: (5+5+4+5+5+5+5+5+5) × 2 = 44 × 2 = **88.0**
- **Raw total: 299 / 330 → 91/100** — clears the 90 target without Wave 12.

**After Waves 1–12** (all waves + polish):
- Usability: 38 × 1.5 = **57.0**
- Simplicity: 31 × 1.5 = **46.5**
- Aesthetics: 41 × 1.5 = **61.5**
- Mobile: 17 × 2 = **34.0**
- PC: 20 × 1 = **20.0**
- Integration: 44 × 2 = **88.0**
- **Raw total: 307 / 330 → 93/100**.

Wave 12 is optional but yields the magazine-quality polish that turns a "good" feature into a flagship one.

---

### Wave 7 — Living Map: plants, tasks, ailments visible
*Single biggest impact wave — turns the layout from a static drawing into a live dashboard of garden state.*

#### 7A. Plant tokens on shapes (2D + 3D)
- Each shape linked to an `area_id` renders up to 8 small **plant tokens** — circular icons coloured by plant type (veg / herb / flower / shrub / tree)
- Token icons sourced from `SmartImage` or a simple per-type silhouette
- Tap a token → mini detail card (species, nickname, age, last watered, "View in Shed")
- Long-press → drag token to another shape (updates `inventory_items.area_id` server-side)
- "+ Plant" button on the shape's bottom edge → opens an "Add Plant to this bed" sheet that filters The Shed by inventory items whose `area_id` is `null`, plus a "+ New plant" affordance
- **Files**: `src/components/garden/shapeStyles.ts`, `src/components/GardenShape3D.tsx`, new `src/components/garden/ShapePlantTokens.tsx`, new `src/components/garden/AddPlantToShapeSheet.tsx`

#### 7B. Task indicators (per-shape attention dots)
- Shapes whose linked area contains plants with **overdue** tasks → pulsing red dot in upper-right
- Shapes with **today's** tasks → amber dot
- Shapes that are all caught up → no dot
- Tap the dot → bottom sheet listing the tasks for that area with one-tap "Done" / "Snooze"
- Reuses existing `TaskEngine.fetchTasksWithGhosts` for the list
- **Files**: shape renderer, new `src/components/garden/ShapeTasksSheet.tsx`

#### 7C. Ailment indicators
- Linked areas with active ailments render the shape with a colored outline:
  - **Yellow** ring: low severity / monitoring
  - **Orange** ring: moderate
  - **Red** ring: severe / urgent
- Tap → ailment summary card, "View in Watchlist", "Ask Plant Doctor"
- **Files**: shape renderer, properties panel

#### 7D. Photo timeline per shape
- New table `garden_shape_photos (id, shape_id, photo_url, taken_at, plant_doctor_diagnosis_id nullable)`
- Camera button in properties panel → take/upload → saved to Supabase Storage bucket `garden-photos/`
- "Photos" tab in properties shows chronological timeline of photos for the shape
- "Diagnose this bed" → sends latest photo + linked plants context to Plant Doctor edge function
- **Files**: new migration `supabase/migrations/<ts>_garden_shape_photos.sql`, new component `src/components/garden/ShapePhotoTimeline.tsx`

**Targets**: I1 → 5, I2 → 5, I3 → 4, A9 → 5, U5 → 5

---

### Wave 8 — Smart Map: AI suggestions, companions, sun-fit
*Makes the layout actionable for new gardeners and analytical for pros.*

#### 8A. AI plant suggestions per shape
- Empty linked shape (no plants yet) shows a "+ Suggest plants" pill on hover/tap
- New edge function `supabase/functions/garden-shape-suggestions/index.ts` takes:
  - Shape's sun classification (from existing `computeAllShapesSunHours`)
  - Recent lux readings for the linked area
  - Area's pH / drainage / growing medium metadata
  - Home's hemisphere + climate zone
  - Current season (date-aware)
- Returns 5 plant suggestions with one-line reasoning ("Lettuce — likes partial shade, good for this bed's 3-hour sun classification")
- User picks → added to area + The Shed in one tap
- **Files**: new edge function, new component `src/components/garden/ShapeSuggestions.tsx`

#### 8B. Companion planting overlay
- New layer toggle: **Companions**
- For each pair of adjacent linked shapes that both contain plants, draw a thin connector line between their centres:
  - **Green** = compatible (e.g. tomato ↔ basil)
  - **Red** = incompatible (e.g. tomato ↔ brassicas)
- Tap the line → small popover explaining the reason
- Static lookup table `src/constants/companionPlants.ts` (≈ 30 of the most common UK/US species pairs); fall back to a Gemini one-shot for unknown species, cached in DB
- **Files**: new constants file, overlay rendered in both 2D + 3D scenes

#### 8C. Sun-fit indicator
- Each linked shape with plants gets a sun-fit badge in the top-left corner:
  - ✓ Sun-fit (all plants are in their preferred sun range based on shape's classification)
  - ⚠ Some plants mismatched
  - ✗ Most plants mismatched
- Tap → explanation listing which plants are happy / unhappy
- Pure logic in `src/lib/sunFit.ts` using existing sun classification + each plant's preferred sun range from `inventory_items.sun_preference` (or fallback to species defaults)
- **Files**: shape renderer, new lib file, unit tests in `tests/unit/lib/sunFit.test.ts`

**Targets**: I6 → 5, A9 → 5 (new gardeners get a clear "what next"), S1 → 4

---

### Wave 9 — Workflows: plans, zones, quick actions
*Connects layout to Planner and turns it into a tactile control surface for daily care.*

#### 9A. Plan filter
- Toolbar dropdown: "Showing: All shapes / Plan: Spring Veggie Bed 2026 / Plan: …"
- Selecting a plan dims (opacity 0.25) shapes not in that plan
- Drawing shapes while filtered to a plan auto-adds them to that plan
- "Add to Plan / Remove from Plan" in shape context menu
- **Schema migration**: `garden_shapes.plan_id uuid nullable references plans(id)`
- **Files**: editor toolbar, new column + migration, `GardenShapeProperties` adds a Plan link field

#### 9B. Watering & care zones (groups)
- Multi-select shapes (Wave 5C) → "Group into Zone" → name + colour
- Zones render with a faint dashed outline around the group
- New table `garden_zones (id, layout_id, name, colour)` + join `garden_zone_shapes (zone_id, shape_id)`
- Long-press a zone → "Mark Zone Watered" → completes today's water tasks for all plants in zone areas
- **Files**: migration, new `src/components/garden/GardenZoneSheet.tsx`

#### 9C. Long-press shape quick actions
- Long-press a shape → bottom action sheet with five large finger-friendly buttons:
  - "Watered ✓" — completes today's water tasks for all plants in linked area
  - "Pruned ✓" — completes today's pruning tasks
  - "Harvested ✓" — completes today's harvest tasks
  - "Take Photo" — opens camera, saves to shape photo timeline
  - "More…" — opens full properties panel
- Optimistic UI + toast on completion
- **Files**: editor + new `src/components/garden/ShapeQuickActions.tsx`

**Targets**: I4 → 5, I5 → 5, M3 → 5, U4 → 5

---

### Wave 10 — Pro Tools: notes, crop rotation, templates

#### 10A. Per-shape notes
- New `garden_shape_notes (id, shape_id, body, created_at)` table — multiple notes per shape, timestamped
- "Notes" tab in properties panel — write new note + see history
- Shape gets a small 📝 corner badge when it has any notes
- Searchable across all layouts via a "Search notes" affordance on the layout list page

#### 10B. Crop rotation history
- Derived view, no new table: query `inventory_items` joined to area history (using updated_at + status changes) for any plant whose area_id was historically the area linked to this shape
- "Previously here" panel in properties: "Tomatoes (2025), Beans (2024)"
- When the user adds a plant of the same botanical family as something planted in this bed within the last 2 years, show an orange warning chip: "⚠ Same family planted here last year — rotate to refresh soil"
- Family lookup added to `src/constants/plantFamilies.ts`

#### 10C. Bed templates
- New table `garden_shape_templates (id, user_id, name, shape_data jsonb, suggested_plant_species text[])`
- "Save as template" in shape context menu — user-private library
- Template captures shape geometry, preset, label, colour, extrude_m, and a list of "plants commonly used here" pulled from the shape's current linked area
- Shape rail gains a "My Templates" section at the bottom; tap → drops a pre-configured shape on the canvas
- **Files**: new migration, new components `src/components/garden/SaveTemplateSheet.tsx`, `src/components/garden/MyTemplatesSection.tsx`

**Targets**: I7 → 5, I9 → 5

---

### Wave 11 — Atmospheric Layers: heatmaps & microclimate report

#### 11A. Expanded layer toggles
- Replace the two separate "Lux" / "Sun" buttons with a single **Layers** dropdown:
  - **Sun** (existing — classification)
  - **Lux** (existing — recent readings)
  - **Moisture** — recent soil moisture from `area_moisture_readings` (new table) or from smart-probe integrations (Wave 12)
  - **pH** — area pH from area metadata, rendered as a gradient (acidic red → neutral grey → alkaline blue)
  - **Wind exposure** — computed: shapes adjacent to high walls/fences are sheltered; open shapes are exposed. Renders shelter/exposure icons
  - **Frost risk** — computed: weather forecast min-temperature + shape's canopy cover + aspect (N-facing = colder) → highlights at-risk shapes tonight
- Only one layer active at a time; layer chip shows in the toolbar
- **Files**: editor toolbar, new lib `src/lib/microclimate.ts` (wind + frost computation)

#### 11B. Microclimate report
- Toolbar action "Microclimate Report" → modal with per-shape report cards:
  - Avg sun hours over the year
  - Dominant lux (median of recent readings)
  - Frost risk for tonight & this week
  - Wind exposure rating
  - Recent moisture (if integration available)
- Modal has "Export PDF" / "Copy share link" actions

#### 11C. Multi-year planting slider (optional)
- Slider at top of editor — drag across years to see what was planted in each shape historically
- Reads from crop rotation history (Wave 10B)
- Educational + delightful for pros tracking long-term garden evolution

**Targets**: I8 → 5, S6 → 5

---

### Wave 12 — Integrations & Polish (Optional but high-delight)

#### 12A. Smart irrigation zone control
- Wave 9B Zones can be linked to a smart-sprinkler integration (existing Integrations area)
- "Run zone for 10 minutes" triggers the device via the integration's API
- Status (running / scheduled / off) shown on the zone outline

#### 12B. Weather station overlay
- If user has a weather-station integration, show a pin on the canvas with current temperature / humidity / wind direction

#### 12C. Export & share
- "Export as PNG" — takes a screenshot of the 2D view at high DPI for printing / sharing
- "Export as PDF" — multi-page export (layout + microclimate report + planting list)
- "Share read-only link" — a public link family members or community can view (no edit)

#### 12D. Animations & micro-interactions
- Framer Motion already in the project — apply to: shape commit, mode switch, undo, plant token entrance, layer toggle
- Hover lift on shapes in PC; tap-ripple on mobile

#### 12E. Starter layout templates (extends Wave 4D)
- Pre-made full layouts in the new-layout wizard:
  - "Allotment plot (10×5 m)" with 4 beds, a shed, and a path
  - "Front border (8×2 m)" with a hedge and a planted strip
  - "Container garden (3×3 m terrace)" with 6 pots and a small water feature

**Targets**: bring 4s to 5s across S1, S6, A1, A9, M3, P2, P3, I8

---

## New Files

| File | Wave | Purpose |
|------|------|---------|
| `src/components/GardenEditorToolbar.tsx` | 1 | Toolbar extracted from god file |
| `src/components/garden/shapeStyles.ts` | 2 | 2D shape renderer with material-aware decoration |
| `src/components/GardenStageBackground.tsx` | 2 | Textured ground for 2D canvas |
| `src/lib/garden3DMaterials.ts` | 3 | three.js material library |
| `src/hooks/useHistory.ts` | 5 | Undo/redo stack |
| `src/components/GardenContextMenu.tsx` | 5 | Right-click menu |
| `src/components/GardenNorthSheet.tsx` | 6 | Focused north-orientation sheet |
| `src/components/garden/ShapePlantTokens.tsx` | 7 | Plant token icons inside shapes |
| `src/components/garden/AddPlantToShapeSheet.tsx` | 7 | Quick-add plant to linked area |
| `src/components/garden/ShapeTasksSheet.tsx` | 7 | Task list popover for a shape |
| `src/components/garden/ShapePhotoTimeline.tsx` | 7 | Photo history per shape |
| `supabase/functions/garden-shape-suggestions/index.ts` | 8 | AI plant suggestion edge function |
| `src/components/garden/ShapeSuggestions.tsx` | 8 | Plant suggestion UI |
| `src/constants/companionPlants.ts` | 8 | Companion-pair static lookup |
| `src/lib/sunFit.ts` | 8 | Sun-fit calculator |
| `src/components/garden/GardenZoneSheet.tsx` | 9 | Watering / care zone management |
| `src/components/garden/ShapeQuickActions.tsx` | 9 | Long-press quick task complete |
| `src/constants/plantFamilies.ts` | 10 | Crop rotation family lookup |
| `src/components/garden/SaveTemplateSheet.tsx` | 10 | Save shape as reusable template |
| `src/components/garden/MyTemplatesSection.tsx` | 10 | Templates in shape rail |
| `src/lib/microclimate.ts` | 11 | Wind + frost computation |

## Critical Files Modified

| File | Waves |
|------|-------|
| `src/components/GardenLayoutEditor.tsx` | 1, 2, 4, 5, 6, 7, 9, 11 |
| `src/components/GardenLayoutList.tsx` | 4, 12 |
| `src/components/GardenLayout3D.tsx` | 3, 7, 8, 11 |
| `src/components/GardenShape3D.tsx` | 3, 7, 8 |
| `src/components/GardenShapePanel.tsx` | 1, 6, 10 |
| `src/components/GardenShapeProperties.tsx` | 1, 2, 7, 9, 10 |
| `src/components/GardenRuler.tsx` | 2 |
| `src/components/AilmentWatchlist.tsx` | 7 — bidirectional link to layout shapes |
| `src/components/PlannerDashboard.tsx` | 9 — "View on Layout" link from a plan |
| `src/components/TheShed.tsx` | 7 — "Place on Layout" affordance |

---

## Database Migrations

| Wave | Migration | Purpose |
|------|-----------|---------|
| 7 | `garden_shape_photos` table | photo + Plant Doctor link per shape |
| 9 | `garden_shapes.plan_id nullable` column | link shapes to plans |
| 9 | `garden_zones` + `garden_zone_shapes` tables | watering/care groups |
| 10 | `garden_shape_notes` table | per-shape notes |
| 10 | `garden_shape_templates` table | user template library |
| 11 | `area_moisture_readings` table | moisture layer source (optional — can come from integrations later) |

---

## Testing

- **Vitest unit** — new utility functions in `garden/shapeStyles.ts`, `garden3DMaterials.ts`, and `useHistory.ts` get pure-function tests
- **Playwright E2E** — extend `garden-layout.spec.ts` to cover new mode names, undo, multi-select, curve drawing, and the new wizard shape options
- Update `docs/e2e-test-plan.md` after each wave

---

## Process

1. Wave 1 → deploy → re-rate → confirm targets
2. Wave 2 → deploy → re-rate → confirm
3. Continue through Waves 3–11 (and Wave 12 if pursuing magazine polish) in the same pattern
4. `npx tsc --noEmit` clean after every wave; full E2E green before deploy
5. Each wave that adds DB schema must migrate locally first, validate with seed data, then push to remote on user confirmation

### Recommended sequencing

The visual/UX waves (1–6) and the integration waves (7–11) are largely independent. Two viable orderings:

- **Sequential (current order)**: 1 → 2 → … → 11. Predictable.
- **Interleaved**: 1 (mobile-first toolbar) → 7 (living map) → 2 (2D aesthetic) → 8 (smart map) → 3 (3D) → 9 (workflows) → 4 (organic + onboarding) → 10 (pro tools) → 5 (power) → 11 (atmospheric) → 6 (calibration). Ships *value* (live map state, task indicators) faster while spreading the visual polish across releases.

My recommendation: **interleaved**. The current feature's biggest pain isn't that it looks ugly — it's that it's disconnected from the rest of the app. Wave 7 delivers the single highest perceived-value bump.
