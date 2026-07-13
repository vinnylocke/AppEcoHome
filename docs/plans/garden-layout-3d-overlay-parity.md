# Garden Layout — 3D overlay parity, 2D toolbar fix, time-aware sun mode

**Date:** 2026-07-13
**Status:** Implemented 2026-07-13 (approved same day). Note: GLB-015 found failing during verification — pre-existing on clean tree. Initially misattributed to the Help Center drawer (it is always DOM-mounted, translated off-screen, so it shows in ARIA snapshots even when closed); actual root cause is the test's canvas-centre drag coords landing below the 800px viewport (weather banners + 1139px-tall canvas). See docs/plans/glb-015-offscreen-canvas-and-tour-seeds.md.

## Problem

Three related gaps in the Garden Layout editor's overlay system:

1. **3D implements only 2 of 7 overlays.** `GardenLayout3D` accepts only `showSunOverlay` and `showLuxOverlay`. Frost, wind, pH, moisture, and companions are Konva-only (2D) — yet the 3D layers menu renders all seven toggle buttons, so five of them are silent no-ops in 3D.
2. **The overlay buttons are unreachable in 2D.** `GardenEditorToolbar` renders `LayersGroup` (and the sun date/time controls) only when `viewMode === "3d"` — and only when `homeLatLng` is set. So the five overlays that *only* work in 2D have no buttons in 2D. Users can never see frost/wind/pH/moisture tints at all right now.
3. **The sun overlay is day-aggregate only.** Its tint is a whole-day sun-hours classification computed from `sunDate`; scrubbing the time slider changes scene lighting but never the tints. User wants a mode where the overlay reflects lit/shaded state *at the slider time*.

## App-reference files consulted

- `docs/app-reference/03-garden-hub/06-garden-layout-editor.md` (primary surface)
- `docs/app-reference/99-cross-cutting/28-sun-analysis.md` (sun classification model)
- CLAUDE.md tier-gating + testing rules

**Doc drift found:** the editor reference says 3D is Sage/Evergreen-only with a Sprout paywall, but `src/constants/tierFeatures.ts` has `garden_layout_3d: ALL` (all gates currently open) — which is why the Sprout test account sees 3D. Code wins on fact; the doc will be corrected in this task.

## Key existing code (read)

- `src/components/GardenLayoutEditor.tsx` — 2D tint logic at ~L1417–1449 (frost/wind/pH/moisture, inline per-shape); companion lines memo at L475–512; `sunAnalysisResults` memo at L527–530; frost forecast fetch at ~L205–246; `sunDateObj`/`useSunPosition` at L402–419.
- `src/components/GardenEditorToolbar.tsx` — `LayersGroup` (all 7 buttons) rendered only in 3D: desktop L626–657, mobile bubble L538–557; `SunControlsInline` same gating.
- `src/components/GardenLayout3D.tsx` + `src/components/GardenShape3D.tsx` — sun overlay = flat tinted plane above each shape (L280–298 in GardenShape3D) + legend; lux = ±30 min badge.
- `src/lib/sunAnalysis.ts` — `computeAllShapesSunHours` (day aggregate) **and `isShapeInShadowAt` (single point in time — already exists, used by Sun Tracker)**.
- `src/lib/garden/microclimate.ts` — `classifyFrostRisk`, `computeWindExposure` (pure).
- `src/hooks/useShapeLiveState.ts` — already returns `ph` + `moisture` per area (fetched regardless of view mode).

## Approach

### A. Extract shared overlay-tint helper (new `src/lib/garden/overlayTints.ts`)

Pure function, single source of truth for both views:

```ts
export function getShapeOverlayTint(shape, ctx: {
  showFrost, showWind, showPh, showMoisture,
  forecast: ForecastDay[], allShapes: ShapeData[],
  areaPh: Record<string, number>, areaMoisture: Record<string, number>,
}): string | null
```

Body is a lift-and-move of the existing 2D branch chain (GardenLayoutEditor L1417–1449), preserving exact colours and priority order (frost > wind > pH > moisture). The 2D render path calls it; 3D receives a precomputed `overlayTintByShapeId: Record<string, string | null>` memo from the editor. No behaviour change in 2D.

### B. 3D parity (the main feature)

`GardenLayoutEditor` passes to `GardenLayout3D`:

- `overlayTintByShapeId` (memo over shapes + overlay toggles + forecast + areaPh + areaMoisture)
- `showCompanionsOverlay` + the existing `companionLines` memo (already view-agnostic — centres are in metres, which map 1:1 to 3D x/z)

`GardenShape3D` gets an `overlayTint: string | null` prop and renders it exactly like the existing sun overlay: a flat plane using `sunOverlayGeom` at y≈0.02, `meshBasicMaterial` with the tint colour (colours already carry alpha — split into color + opacity for three.js). Sun overlay takes precedence over atmospheric tint when both are on (matches 2D's "last wins" being replaced by a documented fixed priority: sun > atmospheric).

`GardenLayout3D` renders companion lines as three.js `Line` segments slightly above ground (y≈0.05) between shape centres, green `#10b981` for Beneficial / red `#ef4444` for Harmful — same palette as 2D.

Frost forecast fetch effect currently keys on `showFrostOverlay` only — already view-mode-independent, no change needed.

### C. Toolbar — overlays available in 2D (the sidenote bug)

`GardenEditorToolbar`:

- Desktop: move `<LayersGroup …/>` out of the `viewMode === "3d"` block so it renders in both views. `SunControlsInline` (date + time slider + play) renders in both views **when `homeLatLng` is set and the sun overlay is on OR viewMode is 3d** (3D keeps it always-visible since it also drives scene lighting; 2D shows it only when relevant, i.e. sun overlay active).
- Mobile bubble: show the layers button in both views; sun-controls button in 3D always (as today) and in 2D when the sun overlay is on.
- The lux + sun buttons stay functional everywhere; sun overlay still requires `homeLatLng` — when it's missing, the sun button is replaced by the existing `LocationPrompt` inside the group (other overlay buttons remain usable, fixing today's all-or-nothing gating).
- 2D lux tint: the 2D stage currently has no lux rendering (lux was 3D-badge-only). Out of scope beyond the button being present; the button already toggles state shared by both views, and 3D behaviour is unchanged. (Noted as a future follow-up.)

### D. Time-aware sun mode

New editor state `sunOverlayMode: "day" | "time"` (default `"day"` — current behaviour).

- UI: when the sun overlay is on, `LayersGroup` shows a small two-option segmented control next to the Sun button — "Day" / "Live" (`data-testid="sun-mode-day"` / `sun-mode-live"`).
- `"day"`: exactly today's behaviour (classification tints, legend).
- `"time"`: per shape, `isShapeInShadowAt(shape, shapes, lat, lng, sunDateObj, northOffset)` (existing lib fn) → memo `litByShapeId` over `[shapes, homeLatLng, sunDateObj, northOffset]`. Lit shapes tint warm yellow `#fde68a`, shaded tint slate `#cbd5e1`; sun below horizon → all shaded. Recomputes live as the slider scrubs or the play animation runs. Cost is O(shapes × blockers) per tick — trivial (same math the day aggregate runs 30× per shape).
- Applies in **both** 2D and 3D (2D gains the sun-controls visibility from part C, so the slider is reachable there).
- 3D legend switches to a two-swatch Lit/Shade legend in `"time"` mode.

### E. Tests (mandatory)

- **Vitest** `tests/unit/lib/overlayTints.test.ts` — tint priority order, each overlay's colour bands (frost risk tiers, wind exposure tiers, pH bands, moisture bands), null when no data / overlay off.
- **Vitest** — extend `tests/unit/lib/garden.test.ts` (or new file) covering lit/shade tint selection for time mode (thin wrapper around `isShapeInShadowAt`).
- **Playwright** `tests/e2e/specs/garden-layout.spec.ts` — new/updated cases: overlay buttons visible in 2D; toggling pH/moisture tints a seeded linked shape in 2D; overlay buttons functional in 3D (button `aria-pressed` + no-crash smoke on canvas); sun-mode segmented control toggles. Page object updates in `tests/e2e/pages/` for the new testids.
- Seeds: worker accounts already have areas + shapes? **Check `supabase/seeds/` for garden_shapes/layout seed** — if layouts aren't seeded, add an idempotent seed (new file or extend existing) with a layout + 2–3 linked shapes so overlay specs are deterministic. (Sketch-to-layout spec exists, so some layout seeding likely exists — verify during implementation.)

### F. Documentation (mandatory)

- `docs/app-reference/03-garden-hub/06-garden-layout-editor.md` — overlays table (note all overlays now work in both views), sun overlay Day/Live modes, toolbar behaviour in 2D, **fix tier drift** (3D currently available to all tiers per `tierFeatures.ts` open gates), local-state table (`sunOverlayMode`).
- `docs/app-reference/99-cross-cutting/28-sun-analysis.md` — document `isShapeInShadowAt` now also powering the layout editor's Live mode.
- `docs/e2e-test-plan/22-garden-layout-builder.md` — new test rows + statuses.
- `TESTING.md` inventory — new unit test file + updated counts.

## Files changed

| File | Change |
|---|---|
| `src/lib/garden/overlayTints.ts` | **New** — shared tint logic |
| `src/components/GardenLayoutEditor.tsx` | Use helper; new memos (`overlayTintByShapeId`, `litByShapeId`); `sunOverlayMode` state; pass new props to 3D + toolbar |
| `src/components/GardenLayout3D.tsx` | Accept tints + companion lines + sun mode; render companion lines + Lit/Shade legend |
| `src/components/GardenShape3D.tsx` | `overlayTint` prop → tinted plane; time-mode sun tint |
| `src/components/GardenEditorToolbar.tsx` | LayersGroup in both views; sun controls visibility; sun-mode segmented control; per-button location gating |
| `tests/unit/lib/overlayTints.test.ts` | **New** |
| `tests/e2e/specs/garden-layout.spec.ts` + page object | Updated/extended |
| `supabase/seeds/` | Verify/extend layout+shape seed if needed |
| Docs listed in §F | Updated |

## Risks / edge cases

- **Overlay stacking in 3D:** 2D uses if/else priority; 3D will mirror the same single-tint priority so the two views never disagree. Sun overlay renders above atmospheric tint if both toggled (sun is the more deliberate toggle).
- **`homeLatLng` null:** sun overlay + Live mode unavailable (as today), but the other overlays must now work without location — the per-button gating in part C is what unlocks this.
- **Performance:** all new memos are pure/synchronous; time-mode recompute per slider tick is negligible. No new fetches.
- **Alpha-suffixed hex colours** (`#dc262640`) don't parse as three.js color + need splitting into `color` + `opacity` for the mesh material — handled in the helper by returning `{ color, opacity }` or split at the 3D call site (implementation detail; unit test locks it).
- **Companion lines in 3D** could z-fight the ground — render at y=0.05 with `depthWrite: false`, same trick the sun overlay plane already uses.

## Out of scope

- Lux heat-tint in 2D (button appears, behaviour unchanged; follow-up candidate).
- Flipping the `garden_layout_3d` tier gate (product decision — flagged only).
- Per-point (sub-shape) shadow resolution — tints remain per-shape-centre.
