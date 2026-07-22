# Seasonal Picks — full-width tiles + fix the Add-to-Calendar modal position/lock

Three issues reported and **reproduced in Playwright** (test1/Evergreen, /dashboard):

## 1. Huge white space to the right of the tiles

**Confirmed.** The tile list is a responsive grid
(`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) but each tile root is a
**fixed** `w-[260px] sm:w-[280px] shrink-0`, so tiles don't fill their grid
cells. Measured: card 1100px, 3 columns ≈ 345px each, tile 280px → ~65px dead
space to the right of every tile; on a single-column (mobile/narrow) layout the
280px tile leaves a huge gap. The fixed width is correct only for the
horizontal-scroll variants (`today`, `carousel`), not the grid (`dashboard`).

**Fix.** Add a `fullWidth?: boolean` prop to `SeasonalPickTile`; the root uses
`w-full` when set, else the existing `w-[260px] sm:w-[280px]`. `SeasonalPicksCard`
passes `fullWidth` for the **dashboard** (grid) and **carousel** (full-slide)
variants, not `today` (which needs the fixed width for its 1.x-tile scroll). The
carousel's `[&>div]:!w-full` wrapper hack becomes redundant and is removed.

## 2 + 3. "Add planting tasks" modal opens off-screen and doesn't lock the page

**Confirmed — same root cause for both.** `AddToCalendarSheet` is rendered
**inline** (not portaled). Measured after tapping the button: the sheet's
`position: fixed` overlay lands at `top: -3124px` (far above the viewport) and
the page behind stays fully interactive. The sheet's nearest ancestor with a
`transform` is the main content scroll container
(`relative … overflow-y-auto`, `transform: matrix(1,0,0,1,0,0)` — an **identity
transform still establishes a containing block** for `position: fixed`; the
"PullToRefresh transform trap"). So `fixed inset-0` resolves against that
scrolled container instead of the viewport → the overlay is off-screen and its
backdrop never covers the real page.

It only worked from the Grow Guide because there it's already rendered inside a
body-level portal (InstanceEditModal / PlantEditModal). Rendered inline on the
home page it breaks.

**Fix.** In `AddToCalendarSheet`, wrap the returned overlay in
`createPortal(…, document.body)` and add `useFocusTrap` (+ Escape-to-close) —
exactly the pattern `LifecycleAnalysisModal` and the other custom modals use.
At the body level the overlay's `fixed inset-0` resolves against the viewport,
so it renders centred (desktop) / bottom-sheet (mobile), the `bg-black/40`
backdrop covers and blocks the page, and focus is trapped. `z-[100]` is
unchanged (above the modals/pages it opens from; below toasts).

**Safe for every caller** (`GrowGuideTab`, `growGuide/GuideSectionCard`,
`nursery/SowingCalendarTab`, `seasonal/SeasonalPicksCard`): the grow-guide
usages already sit in body portals (a second body portal is fine, z-[100] keeps
it on top); the inline Nursery + seasonal usages get the same fix. No caller
passes children that assume the current DOM position.

## Files to change

- `src/components/seasonal/SeasonalPickTile.tsx` — `fullWidth` prop → root width.
- `src/components/seasonal/SeasonalPicksCard.tsx` — pass `fullWidth` on the
  dashboard + carousel branches; drop the now-redundant `[&>div]:!w-full`.
- `src/components/growGuide/AddToCalendarSheet.tsx` — `createPortal` to body +
  `useFocusTrap` + Escape-to-close.

## Tests

- **Vitest** — a small `AddToCalendarSheet` render test asserting it mounts into
  `document.body` (portal) and the backdrop click calls `onClose`. (Existing
  grow-guide + seasonal tests already cover the task assembly + open trigger.)
- **Playwright** — re-run the visual check post-fix: measure the sheet's
  `getBoundingClientRect().top` is within the viewport and `parentElement ===
  document.body`; assert tiles fill their grid cell width. (Kept as a manual
  Playwright verification rather than a new flaky spec, given the AI-picks
  dependency — same rationale as the feature's existing coverage.)

## App-reference / docs

- `docs/app-reference/02-dashboard/14-seasonal-picks.md` — note tiles are
  full-width in the grid; note the sheet is portaled to body.
- `docs/app-reference/08-modals-and-overlays/*` (AddToCalendarSheet, if it has a
  file) — note the portal + focus trap.
- release-notes.json when shipped (2 fixes).

## Risk

Low. The portal change is the established pattern; the width change is a
CSS-only prop. Main watch-item: confirm the sheet still stacks above
InstanceEditModal/PlantEditModal when opened from the Grow Guide (z-[100] vs the
modals' z) — verify in Playwright after the change.
