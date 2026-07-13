# 22. Garden Layout Builder

**Routes:** `/garden-layout` (list) and `/garden-layout/:layoutId` (editor)
**Spec files:** `tests/e2e/specs/garden-layout.spec.ts`, `tests/e2e/specs/sketch-to-layout.spec.ts` (Sketch → Layout wizard, Stage 18)
**Components:** `GardenLayoutList.tsx`, `GardenLayoutEditor.tsx`, `GardenEditorToolbar.tsx`, `GardenShapePanel.tsx`, `GardenShapeProperties.tsx`, `GardenRuler.tsx`, `GardenScaleBar.tsx`
**Seed dependencies:** `00_bootstrap.sql` seeds the test home with lat/lng (London) so the sun overlay, time slider and Day/Live mode are exercisable, and seeds `onboarding_state` with all Shepherd tours dismissed so no auto-firing tour card intercepts the raw-mouse canvas drags; layouts themselves are created in tests. Note the 3 seeded weather alerts (`04_weather.sql`) push the editor down at 1280×800 — canvas drags must use `visibleCanvasCentre()` (defined in the spec), never the element-centre.
**App-reference:** [05-tools/](../app-reference/05-tools/)

The most surface-rich section in the suite. Tests are bucketed by Wave (1A through 12E).

## Stage 1 — Layout list

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-001 | ✅ | Layout list loads via nav — `create-layout-btn` visible | — | ✅ Passing |
| GLB-002 | ✅ | Blank-canvas wizard creates a layout + navigates to editor | — | ✅ Passing |

## Stage 2 — Desktop editor toolbar (Wave 1A/B)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-006 | ✅ | Desktop toolbar single-row with three mode buttons | — | ✅ Passing |
| GLB-007 | ✅ | Mode buttons show Draw / Edit / Look labels | — | ✅ Passing |
| GLB-008 | ✅ | View toggles + zoom + settings in 2D | — | ✅ Passing |
| GLB-009 | ✅ | Switching to 3D hides zoom controls | — | ✅ Passing |

## Stage 3 — Shape rail sections (Wave 1D)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-010 | ✅ | Rail has Beds / Structures / Hardscape / Features sections | — | ✅ Passing |
| GLB-011 | ✅ | Known presets render in their sections (raised-bed, greenhouse, path, pond) | — | ✅ Passing |

## Stage 4 — Phone READ-ONLY viewer (2026-07-08, was: mobile toolbar Wave 1A)

Phones (<768px) get a view-only layout viewer — no draw/edit tools
(docs/plans/garden-layout-fixes-and-mobile-readonly.md).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-012 | ✅ | Mobile viewer renders two rows + floating bubble; row 2 is the view-only banner | — | ✅ Passing |
| GLB-013 | ✅ | Floating bubble keeps view + zoom + layers (overlays viewable on phones), hides settings (read-only) | — | ✅ Passing |
| GLB-014 | ✅ | No shape rail and no mode strip on the phone viewer | — | ✅ Passing |
| GLB-017 | ✅ | List card body tap opens the layout viewer (not rename) at 390×844 | — | ✅ Passing |
| GLB-018 | ✅ | Kebab menu holds rename / duplicate / delete on phones; inline icons hidden | — | ✅ Passing |

## Stage 5 — Properties tabs (Wave 1C)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-015 | ✅ | Drawing a shape opens 4 properties tabs (Style/Size/Link/Photos — Wave 7D added Photos) | — | ✅ Passing (fixed 2026-07-13: root cause was the canvas-CENTRE drag coords landing below the 800px viewport — weather banners + a 1139px-tall canvas. GLB-015/016 now drag around `visibleCanvasCentre()`, the centre of the canvas∩viewport intersection. History + false Help-drawer lead: docs/plans/glb-015-offscreen-canvas-and-tour-seeds.md) |
| GLB-016 | ✅ | Tabs reveal the right fields | — | ✅ Passing |

## Stage 6 — Living map (Wave 7) — requires linked area + plants in seed

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-017 | 🔲 | Shape linked to area with plants renders plant tokens | — | 🔲 Pending seed extension |
| GLB-018 | 🔲 | Shape with active ailments renders coloured ring | — | 🔲 Pending seed extension |
| GLB-019 | 🔲 | Link tab Pending Tasks shows count + one-tap done | — | 🔲 Pending seed extension |
| GLB-020 | ✅ | Photos tab opens the timeline | — | ✅ Passing |

## Stage 7 — Smart map (Wave 8)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-021 | ✅ | Companions toggle visible in toolbar (now both views — see Stage 19) | — | ✅ Passing |
| GLB-022 | 🔲 | AI suggestions button on linked shape | — | 🔲 Pending seed extension |

## Stage 8 — Workflows (Wave 9)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-023 | ✅ | Plan filter chip visible | — | ✅ Passing |
| GLB-024 | ✅ | Plan filter menu opens with "All shapes" option | — | ✅ Passing |
| GLB-025 | 🔲 | Quick Actions sheet opens from properties Link tab CTA | — | 🔲 Pending seed extension |

## Stage 9 — Pro tools (Wave 10)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-026 | 🔲 | Per-shape notes can be added and listed | — | 🔲 Pending E2E coverage |
| GLB-027 | 🔲 | Planting history shows past plants when shape is linked | — | 🔲 Pending seed extension |

## Stage 10 — Microclimate report (Wave 11B)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-028 | ✅ | Microclimate Report button opens modal | — | ✅ Passing |
| GLB-029 | ✅ | Report modal closes via X | — | ✅ Passing |

## Stage 11 — Aesthetics (Waves 2 / 6)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-030 | ✅ | Palette tabs (foliage / hardscape / water / accents) | — | ✅ Passing |
| GLB-031 | 🔲 | Swatch click from non-foliage palette updates shape colour | — | 🔲 Pending E2E |

## Stage 12 — Free-form drawing (Wave 4A)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-032 | ✅ | Free-form Bed tile visible in shape rail | — | ✅ Passing |
| GLB-033 | 🔲 | Drawing 3+ points → dblclick → shape persists with curve-bed preset | — | 🔲 Pending E2E |

## Stage 13 — Onboarding + coach marks (Wave 4C)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-034 | ✅ | Empty editor shows first-shape coach mark | — | ✅ Passing |

## Stage 14 — Undo / Redo + keyboard shortcuts (Wave 5)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-035 | ✅ | Undo / Redo buttons in toolbar | — | ✅ Passing |
| GLB-036 | 🔲 | Drawing + Ctrl+Z removes shape | — | 🔲 Pending E2E |
| GLB-037 | 🔲 | Ctrl+D duplicates selected shape | — | 🔲 Pending E2E |

## Stage 15 — Smart map polish

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-038 | 🔲 | Sun-fit badge on linked shape with known classification | — | 🔲 Pending |
| GLB-039 | ✅ | Snap-to-grid toggle visible | — | ✅ Passing |
| GLB-040 | ✅ | Right-click opens context menu (duplicate / delete) | — | ✅ Passing |
| GLB-041 | ✅ | Frost / Wind / Companions toggles in toolbar (now both views — see Stage 19) | — | ✅ Passing |

## Stage 16 — Wizard expanded shapes (Wave 4B) + Starter layouts (Wave 12E)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-042 | ✅ | T-shape + Trapezoid options in builder step 1 | — | ✅ Passing |
| GLB-043 | ✅ | "Starter Layout" entry visible in new-layout wizard | — | ✅ Passing |
| GLB-044 | ✅ | All three starter templates render | — | ✅ Passing |

## Stage 17 — Zones + Templates + North + Export

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-045 | ✅ | Zones / Templates / Microclimate / Export launchers in canvas top-right | — | ✅ Passing |
| GLB-046 | ✅ | Tap canvas compass opens North sheet | — | ✅ Passing |
| GLB-047 | 🔲 | Zones sheet "Create Zone" disabled with no selection | — | 🔲 Pending E2E |

## Stage 18 — Sketch → Layout wizard (Sage+ AI feature)

**Spec file:** `tests/e2e/specs/sketch-to-layout.spec.ts`
**Component:** `SketchToLayoutWizard.tsx`, `src/lib/garden/sketchToShapes.ts`, `src/services/sketchToLayoutService.ts`
**Seed dependencies:** None (layout created in test). The default E2E worker accounts are not guaranteed to be Sage tier, so the spec is written to be non-failing on either side of the tier gate — see below.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SKL-001 | ✅ | Wizard opens via `create-sketch-layout` from the create-layout modal. Non-Sage accounts: asserts `sketch-to-layout-ai-gate` renders and stops. Sage+ accounts: mocks `**/functions/v1/sketch-to-layout`, uploads a fixture PNG via `sketch-upload-file`, runs detect → scale (`sketch-scale-width`) → classify (asserts `sketch-shape-row-0`/`sketch-shape-row-1` render for both mocked shapes) → review → create, and asserts navigation to `/garden-layout/:id` | `**/functions/v1/sketch-to-layout` (Sage+ branch only) | ✅ Passing |

Unit coverage for the client-side metre-conversion math (`computeCanvasSize`, `normalizedWidthOf`, `gardenWidthFromShapeWidth`, `detectionToShapes`, `KIND_TO_PRESET_ID`) lives in `tests/unit/lib/sketchToShapes.test.ts` (Vitest), not here — see TESTING.md § Current Test Inventory.

## Stage 19 — Overlay parity + time-aware sun (2026-07-13)

All seven overlays (sun, lux, companions, frost, wind, pH, moisture) now work in **both** 2D and 3D
(plan: docs/plans/garden-layout-3d-overlay-parity.md). The toolbar's layers group renders in both
views; the sun overlay gained a Day/Live mode switch (`sun-mode-day` / `sun-mode-live`) where Live
tints shapes lit/shaded at the slider time via `isShapeInShadowAt`. Tint colour maths is
unit-covered in `tests/unit/lib/overlayTints.test.ts`; these rows cover the UI wiring.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GLB-048 | ✅ | 2D desktop toolbar shows every overlay toggle (layers no longer 3D-only) | — | ✅ Passing |
| GLB-049 | ✅ | Wind / pH / Moisture toggles flip `aria-pressed` in 2D without crashing the stage | — | ✅ Passing |
| GLB-050 | ✅ | Sun overlay in 2D reveals date + time slider and Day/Live switch; Live selects | — | ✅ Passing |
| GLB-051 | ✅ | Frost / pH / Moisture / Companions toggles stay available + functional in 3D | — | ✅ Passing |
| GLB-052 | ✅ | Live sun mode in 3D; scrubbing the time slider keeps the scene alive | — | ✅ Passing |
