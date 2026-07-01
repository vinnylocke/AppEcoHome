# RHO-6 — Garden Walk: Snap sheet doesn't scroll/focus into view

**Jira:** RHO-6 · Bug · Medium · Sprout, Pixel Tablet landscape.

## Problem
In the Garden Walk, tapping **Snap** opens the image-capture sheet, but the screen doesn't
auto-scroll/focus to it — on a wide landscape screen the actionable content sits top-aligned
with empty space below, so it looks like nothing happened.

## Root cause
The Snap sheet is a `fixed inset-0 z-50` full-screen overlay
([WalkPlantCard.tsx:346-403](../../src/components/walk/WalkPlantCard.tsx#L346-L403)), toggled purely
by conditional render from `sheet` state ([WalkPlantCard.tsx:74](../../src/components/walk/WalkPlantCard.tsx#L74)).
There's no `scrollIntoView` on the sheet's `overflow-y-auto` body ([:367](../../src/components/walk/WalkPlantCard.tsx#L367))
and no focus move (unlike the Note sheet's `<textarea autoFocus>` at :430). So nothing draws the
eye to the newly-mounted section.

## App-reference consulted
- [docs/app-reference/02-dashboard/13-garden-walk.md](../app-reference/02-dashboard/13-garden-walk.md)
- [docs/app-reference/99-cross-cutting/34-accessibility.md](../app-reference/99-cross-cutting/34-accessibility.md) (modal focus contract)

## Recommended fix
Add a `ref` (or top anchor) on the Snap sheet's scroll container and, in a `useEffect` keyed on
`sheet === "snap"`, `ref.current?.scrollIntoView({ block: "start" })` **on the sheet's own
`overflow-y-auto` body** (the page scroll is a no-op since it's `fixed inset-0`) and move focus
into the sheet (PhotoUploader trigger or the close button). Mirror for the Note sheet for
consistency. Respect reduced-motion. Add a `data-testid` anchor for the E2E assertion. Scope:
`WalkPlantCard.tsx` only.

## Tests
- E2E: open a walk, tap Snap, assert the capture sheet (its testid) is in view / focused.

## Risks
- Focus move must not fight PhotoUploader's own file-input focus.
