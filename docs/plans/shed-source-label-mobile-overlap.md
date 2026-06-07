# Plan — Shed source label moves to bottom-left on every viewport

## Context

22.0007 moved the Shed tile source label (Perenual / Verdantly / AI / Manual) from `bottom-3 right-3` → `top-3 left-3` to clear the `MultiImageGallery` "Photos" button at bottom-right. That worked on desktop, but on phone the top-right action buttons row (4–5 buttons × 44px + gaps) is wide enough to overlap the top-left source label on narrower viewports.

The user's suggested fix is the right one — move it to bottom-left. The only thing there today is the `UpdatedChip`, and it's conditional (only when the AI freshness check has a pending update), so most tiles will show the source label alone. When both are present we stack them vertically.

## Approach

Combine both bottom-left elements (source label + conditional `UpdatedChip`) into a single `flex flex-col gap-1.5` container anchored at `bottom-3 left-3`. Order: `UpdatedChip` (top, conditional) → source label (bottom, always). That way the source label keeps its position even when the chip appears, and there's no overlap with either the action buttons (top-right) or the Photos button (bottom-right).

Final ownership of the photo corners:

| Corner | Owner |
|--------|-------|
| Top-left | (empty — keeps the photo cleaner on mobile) |
| Top-right | Action buttons (Layout / Light / Ask AI / Archive / Delete) |
| Bottom-left | `UpdatedChip` (conditional) + source label, vertically stacked |
| Bottom-right | `MultiImageGallery` "Photos" trigger |

## Files modified

| File | Change |
|------|--------|
| [`src/components/TheShed.tsx`](../../src/components/TheShed.tsx) | Wrap `UpdatedChip` + source label in a single `bottom-3 left-3` flex column |

## Tests

Visual only — no new units.

## Deploy

Frontend-only. Minor bump → **22.0008**.

## Risks

- None. The Photos button (bottom-right) and action buttons (top-right) keep their positions; the source label just relocates to the previously-shared bottom-left corner.
