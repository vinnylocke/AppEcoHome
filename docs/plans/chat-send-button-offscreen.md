# Chat send button off-screen on small devices

## Problem
On phones / narrow viewports, the **send (submit) button** in the chat windows scrolls off the right edge and can't be reached.

## Cause
Both chat input rows are flex containers with a `flex-1` text input and a fixed-size send button. The input has **no `min-w-0`**, so flexbox's default `min-width: auto` prevents it shrinking below its intrinsic content width — overflowing the row and pushing the send button past the screen edge.

Affects both:
- `src/components/PlantDoctorChat.tsx` — input at L1407–1415 (`flex-1`, no `min-w-0`); send button already `shrink-0`.
- `src/components/manager/HeadGardenerChat.tsx` — input at L94–100 (`flex-1`, no `min-w-0`); send button has no `shrink-0`.

## App-reference consulted
- `docs/app-reference/05-tools/03-plant-doctor-chat.md`
- `docs/app-reference/02-dashboard/16-head-gardener.md`

## Fix (CSS only — no behaviour, data, or selector changes)
1. **PlantDoctorChat.tsx** — add `min-w-0` to the `flex-1` text input.
2. **HeadGardenerChat.tsx** — add `min-w-0` to the `flex-1` input, and `shrink-0` to the send button so the icon button keeps its size.

`min-w-0` is the canonical fix for "flex item won't shrink"; it has no effect on desktop where there's already room.

## Tests / docs
- CSS-only, `data-testid`s unchanged → no unit/Page-Object change applies. (Optional follow-up: a Playwright check at a mobile viewport asserting `chat-send` is within the viewport — noted, not required for this fix.)
- No app-reference content change (layout fix, no behaviour change).

## Risk
Minimal — additive utility classes; affects only narrow-screen layout.
