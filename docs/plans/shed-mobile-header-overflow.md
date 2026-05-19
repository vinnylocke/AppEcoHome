# Plan — Fix Shed header buttons overflowing on mobile

## The bug

On a phone, the **Add Plant** button on `/shed` is positioned off the right edge of the viewport — unclickable. Reported by user.

## Root cause

In `src/components/TheShed.tsx` (line ~1139), the header puts the H1, sync loader, and the three action buttons (`Select`, `Layout`, `Add Plant`) on a single `flex items-center gap-4` row. No `flex-wrap`. The buttons live inside `<div className="ml-auto xl:ml-0 ...">` which pushes them to the right with `ml-auto`. With `text-4xl` H1 + three buttons (Add Plant carries text even on mobile), the row's intrinsic width exceeds ~410px — wider than every phone viewport — and the `ml-auto` makes the buttons spill off-screen instead of wrapping.

## Fix

In the existing header block of `TheShed.tsx`:

1. Add `flex-wrap` to the inner row so the buttons drop to a second line below the title on phones.
2. Shrink the H1 from `text-4xl` to `text-3xl sm:text-4xl` to claw back some horizontal space.
3. Trim the `Add Plant` button's left/right padding slightly (`px-5` → `px-4 sm:px-5`) so it fits in narrower wrappers.

No structural changes — purely Tailwind class adjustments to the existing JSX.

## Files

- `src/components/TheShed.tsx`

## Verification

1. Type-check clean.
2. In dev tools, throttle to a 375px viewport (iPhone SE) — all three buttons must be visible and tappable.
3. xl breakpoint behaviour unchanged — header still on one row.
