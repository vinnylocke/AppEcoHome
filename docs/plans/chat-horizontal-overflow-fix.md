# Chat opens → page scrolls horizontally (esp. installed PWA)

## Problem

On some phones (often when installed as a PWA), opening the Garden AI chat shifts slightly
off the right edge and makes the whole page horizontally scrollable.

## Root cause

1. **`100vw` on a right-anchored fixed panel.** The chat panel
   (`PlantDoctorChat.tsx`, ~line 1060) is `fixed bottom-24 right-6 … max-w-[calc(100vw-3rem)]`.
   `right: 1.5rem` is measured against the layout viewport, but `100vw` includes the
   scrollbar gutter / PWA chrome — on iOS standalone PWAs `100vw` can be a few px wider than
   the actual layout width, so the panel's box pushes past the right edge.
2. **No document-level `overflow-x` guard.** `index.css` sets `overscroll-behavior-y: none`
   on `html, body` but no `overflow-x`, so any few-px overflow from a fixed/absolute element
   creates a horizontal scrollbar instead of being clipped.

## Fix (two small, low-risk changes)

1. **`src/components/PlantDoctorChat.tsx`** — chat panel: `max-w-[calc(100vw-3rem)]` →
   `max-w-[calc(100%-3rem)]`. For a `position: fixed` element, `%` resolves against the same
   containing block (the viewport) as `right`, and excludes the scrollbar — so the panel can
   no longer exceed the visible width.
2. **`src/index.css`** — add a document guard: `overflow-x: clip` on `html, body`.
   `clip` (not `hidden`) is used deliberately: it clips horizontal overflow **without**
   establishing a scroll container, so it won't break the app's `position: sticky` usage
   (15 files). Inner `overflow-x-auto` scroll rows are unaffected (they're descendant scroll
   containers). Vertical scrolling is untouched.

## Risks

- `overflow-x: clip` is supported in all modern mobile browsers (iOS 16+, Chrome/Firefox) —
  fine for PWA users. It does not affect `overflow-y` / vertical scroll, the modal scroll
  lock (`body:has(…){overflow:hidden}`), or pull-to-refresh.

## Tests / verify

- `npm run build`. Visual: open the chat on a narrow viewport — no horizontal scrollbar; the
  panel sits within both margins. (CSS-only; no unit test surface.)
