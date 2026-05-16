# Plan — Mobile UI Fixes (3 issues)

## Problem

Three UI components break on narrow/phone viewports:

1. **Dashboard tab bar overflows to the right** — 4 tabs inside `inline-flex` with `px-4 py-2` each; on ~390px screen this pushes the last tab offscreen.
2. **Garden Layout Editor toolbar overflows** — a single `flex` row packs back button + name + save state + mode buttons + 2D/3D toggle + zoom (+ 3D sun controls in sun mode) with no wrapping or scroll, so it spills right on mobile.
3. **Plant Visualiser "Set Plant Art" / "Open Visualiser" CTA bar stays near the first plant** — the bar uses `position: fixed; bottom: 0; left: 0; right: 0` but PlantVisualiser is nested inside `PullToRefresh`, which applies `transform: translateY(pullDistance)`. Any `transform` on an ancestor creates a new stacking/containing block for `fixed` elements, so the bar is positioned relative to the transformed container rather than the viewport.

---

## Fix 1 — Dashboard tabs (`src/App.tsx`, ~line 866)

**Change:** make the tab switcher a full-width flex container with equal-width buttons.

```tsx
// Before
<div data-testid="dashboard-view-switcher" className="bg-rhozly-primary/5 p-1 rounded-2xl inline-flex">
  {["dashboard", "locations", "calendar", "weather"].map((v) => (
    <button
      className={`px-4 py-2 min-h-[44px] rounded-xl text-sm ...`}
    >
      {v.charAt(0).toUpperCase() + v.slice(1)}
    </button>
  ))}
</div>

// After
<div data-testid="dashboard-view-switcher" className="bg-rhozly-primary/5 p-1 rounded-2xl flex w-full">
  {["dashboard", "locations", "calendar", "weather"].map((v) => (
    <button
      className={`flex-1 px-2 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm text-center ...`}
    >
      {v.charAt(0).toUpperCase() + v.slice(1)}
    </button>
  ))}
</div>
```

No logic change — purely presentational.

---

## Fix 2 — Garden Layout Editor toolbar (`src/components/GardenLayoutEditor.tsx`, ~line 778)

**Change:** add `overflow-x-auto` to the toolbar row so it scrolls horizontally on mobile rather than clipping.

```tsx
// Before
<div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-rhozly-outline/20 shrink-0">

// After
<div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-rhozly-outline/20 shrink-0 overflow-x-auto">
```

All existing controls remain; on mobile the user can scroll the toolbar left/right (standard pattern for canvas editors). The mode labels are already `hidden sm:inline` so they're icon-only on mobile.

---

## Fix 3 — Plant Visualiser CTA bar (`src/components/PlantVisualiser.tsx`, ~line 421)

**Root cause:** `position: fixed` is broken by the PullToRefresh ancestor's `transform`.

**Fix:** render the CTA bar into `document.body` using `ReactDOM.createPortal`. Portals escape the transform stacking context, so `position: fixed` works relative to the viewport again.

```tsx
// Add import at top
import { createPortal } from 'react-dom';

// Wrap the fixed bar (no other changes to the bar itself)
{createPortal(
  <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
    ...existing CTA bar content...
  </div>,
  document.body
)}
```

Also add `pb-32` to the plant grid outer div (currently has no bottom padding) so the fixed overlay bar never covers the last plant card.

---

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Tab container: `inline-flex` → `flex w-full`; tab buttons: add `flex-1`, reduce padding on mobile |
| `src/components/GardenLayoutEditor.tsx` | Toolbar: add `overflow-x-auto` |
| `src/components/PlantVisualiser.tsx` | Import `createPortal`; wrap fixed bar in portal; add `pb-32` to plant grid |

---

## Risks / Edge Cases

- Portal CTA bar: z-index 40 should still sit below the mobile bottom nav (which is typically z-50+); if the nav covers the CTA, we adjust the bar's `bottom` value — but visually that should be fine since the nav is a separate fixed element.
- Dashboard tabs: `text-xs sm:text-sm` makes the labels slightly smaller on mobile, but they remain fully readable.
- Garden layout toolbar scroll: on mobile, users may not immediately discover the horizontal scroll, but this is the industry norm for drawing tools and is better than a clipped layout.
