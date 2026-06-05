# Plan — Nursery summary text clipped on phone

## Context

User: "now on the nursery screen it now has where it says 1 packet 1 active, etc the text is cut off on phone so you can't read it"

Caused by yesterday's 21.0008 fix where I added `min-w-0 flex-1 truncate` to the summary `<p>` to let the buttons stay on-screen. The truncate works as a safety valve when both elements share a row, but on phone the summary is being clipped before the user finishes reading "X active sowings · Y approaching sow-by".

## Approach

Stack the summary header vertically on phone (full-width summary on row 1, button row on row 2), and only go side-by-side on tablet+. The buttons row already fits comfortably on a 360px viewport after 21.0008's abbreviation work, so giving it its own row on mobile costs no horizontal space and reclaims the summary's clipped tail.

Concretely, on [`NurseryTab.tsx:192`](../../src/components/nursery/NurseryTab.tsx#L192):

```tsx
// Before — single row with truncating summary
<div className="flex items-center justify-between gap-3 px-1">

// After — column on phone, row from sm: up
<div className="flex flex-col items-stretch gap-2 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
```

And drop `min-w-0 flex-1 truncate` from the summary `<p>` since it no longer competes with the buttons for space.

## Files modified

| File | Change |
|------|--------|
| [`src/components/nursery/NurseryTab.tsx`](../../src/components/nursery/NurseryTab.tsx) | Stack header vertically on phone; drop truncate from summary |

## Tests

- Visual regression only — verify summary reads fully on a 360px viewport.

## Deploy

- Frontend-only, minor bump → 21.0009.

## Risks

- None. Wraps to two rows on phone but adds only ~36px vertical, well within the visible viewport.
