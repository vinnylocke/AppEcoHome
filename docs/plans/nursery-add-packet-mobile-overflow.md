# Plan — Nursery "Add packets" button off-screen on phone

## Context

User: "on phone in the nursery the add packet button is slightly off screen which makes it scrollable, it needs to be a fixed width and all be visible on the screen"

Confirmed at [`NurseryTab.tsx:192-242`](../../src/components/nursery/NurseryTab.tsx#L192-L242). The summary header is a single `flex items-center justify-between` row containing:
- LEFT: `<p>` summary text — "X packets · Y active sowings · Z approaching sow-by"
- RIGHT: three pill buttons — Scan (Sage+ only), Paste, Add packets

The container has no `flex-wrap`, no `min-w-0` on the summary, and the buttons row has no `shrink-0`. On phone widths the three full-text buttons (~240-280px) plus the summary text + gaps overflow the viewport, so "Add packets" slips off the right edge and the user can horizontal-scroll to it.

## App-reference files consulted

- [`docs/app-reference/03-garden-hub/10-nursery.md`](../app-reference/03-garden-hub/10-nursery.md) — confirms the summary header is canonical UI; no mention of mobile layout currently

## Approach

Two small layout fixes:

### 1. Let the summary shrink

Add `min-w-0 flex-1 truncate` to the `<p>` so it claims the remaining space and clips with ellipsis rather than pushing the buttons off-screen. The full text is preserved (browser overlays on hover); the most useful information is "X packets" at the front which always shows.

### 2. Abbreviate "Add packets" on mobile

The Scan and Paste buttons already use the `hidden sm:inline` / `sm:hidden` pattern for icon-with-text. Apply the same to "Add packets" → "Add" on phone:

```tsx
<button ...>
  <Plus size={12} />
  <span className="hidden sm:inline">Add packets</span>
  <span className="sm:hidden">Add</span>
</button>
```

Saves ~60px on the busiest viewport.

### 3. Add `shrink-0` to the buttons row

Belt-and-braces so the buttons cluster never compresses below their natural size. Combined with the summary's `min-w-0 flex-1 truncate`, the summary always yields first.

### 4. (Removed earlier idea — no flex-wrap needed)

After (1)-(3) the three buttons fit cleanly even on a 320px viewport. No row-wrap required.

## Files modified

| File | Change |
|------|--------|
| [`src/components/nursery/NurseryTab.tsx`](../../src/components/nursery/NurseryTab.tsx) | Summary `<p>` gets `min-w-0 flex-1 truncate`; button row gets `shrink-0`; Add packets gets mobile-abbreviated text |

## Tests

- Visual regression only — verify on phone viewport that all three buttons fit inside the screen with no horizontal scroll.

## Deploy

- Frontend-only.
- Minor bump → 21.0008.

## Risks

- Tiny. The summary truncation only hides extra context strings (active sowings + approaching sow-by) on very narrow screens; the core "X packets" lead is preserved.
