# Garden Layout — bug fixes + phone read-only viewer

**Date:** 2026-07-08 · **User report:** "the 2D doesn't seem to work or even match the 3D… a lot of the controls don't really fit the screen… it should be visible on phone, even if it's read only."

**Verified live** (Playwright on prod, demo account, layouts with 8 shapes each in `garden_shapes`):
1. Phone: tapping a layout card opens **rename**, not the editor — mobile users can't enter the editor at all.
2. Desktop 2D: grid + rulers render, **zero shapes** drawn (coords are in-range: x 1–20m in a 24×16m canvas).
3. Desktop 3D: renders, but the initial camera leaves the garden squeezed into the bottom-right corner.
4. Controls overflow at 1280px: layout name/dimensions wrap, the 3D time slider clips off-screen, floating pill row collides with the 2D ruler.

**App-reference consulted:** `03-garden-hub/05-garden-layout-list.md`, `03-garden-hub/06-garden-layout-editor.md`, `99-cross-cutting/02-data-model-spatial.md`.

**Code diagnosis** (agent investigation, file:line):
- List cards: `GardenLayoutList.tsx:549–583` — the title button (`flex-1`) and fixed-width rename/duplicate/delete icons share the card row; at 390px the touch targets overlap, so taps land on rename.
- 2D shapes: `GardenLayoutEditor.tsx:509` (fetch), `:1195–1197` (`x_m * BASE_PX` positioning), `:1078/:1168` (plan-filter dimming). The agent's two hypotheses (NULL-`plan_id` filter dimming vs off-canvas transform) **don't fully explain a totally empty canvas** — first implementation step is local reproduction + instrumentation to pin the real cause before fixing. This is the crux bug.
- 3D camera: `GardenLayout3D.tsx:212` — hard-coded `position: [canvasW/2, 20, canvasH+15]` puts the camera at a back corner; OrbitControls target (`:249`) is correct.
- Toolbar: `GardenEditorToolbar.tsx:580–621` (name block + 400px `SunControlsInline`), `:256–264` (fixed `w-28` time slider, no shrink).

## Work

### A. Bug fixes (order matters — a read-only viewer of a blank canvas is useless)

1. **2D shape rendering** — reproduce locally against seeded shapes; instrument the fetch → state → Konva render path; fix root cause (whatever it proves to be: silent fetch failure, filter, transform, or layer visibility). Regression coverage: extract the shape→pixel transform (and any filter predicate) into `src/lib/` pure helpers with Vitest tests, + an E2E assertion that shape nodes exist after opening a seeded layout.
2. **List tap → editor** — restructure the card for touch: the card body (preview + title) navigates; rename/duplicate/delete collapse behind a kebab (`…`) menu on small screens (kept inline on `sm:`+). Fixes the overlap class of bug rather than nudging pixels.
3. **Camera fit-to-content on open** — 3D: position derived from the canvas bounds, centred and elevated (`[w/2, ~0.9·max(w,h), h/2 + ~0.9·max(w,h)]`, target unchanged); 2D: initial Konva stage scale/position fits the canvas (with padding) into the viewport instead of 1:1 at origin.
4. **Toolbar responsiveness** — desktop row: name stays one truncated line; sun controls collapse into a popover below ~1440px; time slider gets `min-w-0` + shrink; floating pill row drops below the ruler line (z/offset) in 2D.

### B. Phone read-only viewer

- New `viewOnly` state in the editor: `true` when the viewport is coarse-pointer/narrow (same breakpoint the toolbar already uses for its mobile bubble). Reuses the existing `canEdit=false` pathway (`modes` filtering at `GardenLayoutEditor.tsx:119`) and additionally hides: shape rail, draw/move modes (LOOK only), transformer handles, undo/redo, settings, templates/zones pills, and the Quick Actions sheet's destructive entries (rename/duplicate/delete/link) — the sheet becomes a read-only info card (name, size, linked area, plants).
- Keeps: 2D/3D toggle, pan/zoom/orbit, overlay toggles (sun/lux/companions), compass, tap-shape info.
- A slim dismissible banner: "View-only on this screen size — edit on a tablet or computer." (No promise language.)
- List page on phone: cards navigate (per A2) — viewer opens directly.

### C. Tests & docs

- Vitest: transform/filter helpers from A1; `viewOnly` derivation helper.
- Playwright: phone viewport spec — layout card tap lands in the viewer (not rename), read-only banner visible, no draw rail; desktop spec — editor opens with shapes present.
- App-reference: `05-garden-layout-list.md` (kebab actions), `06-garden-layout-editor.md` (camera fit, viewOnly mode, toolbar collapse) — both roles.
- e2e-test-plan: garden layout section rows updated/added.

## Risks

- The 2D render fix is diagnosis-first — scope may shift once the real cause is pinned (kept isolated as step A1).
- Kebab menu changes list-card testids used by any existing specs (will sweep `tests/e2e` for `rename-layout`/`duplicate-layout` selectors).
- Camera changes affect existing users' muscle memory — fit-to-content is strictly better for first paint; orbit/pan behaviour unchanged.

## Ship

Implement A → B → C in one branch of work; gates (`typecheck`, unit, functions, build) → release notes → deploy `--bump 1` → push. Playwright verification on prod after deploy (same probe script as the diagnosis).
