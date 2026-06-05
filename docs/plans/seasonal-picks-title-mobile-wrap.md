# Plan — SeasonalPicksCard title truncated on mobile

## Context

User: "on phone the what you can grow this week is cut off so you can't read the whole title"

Confirmed at [`SeasonalPicksCard.tsx:338`](../../src/components/seasonal/SeasonalPicksCard.tsx#L338): the `<h2>` has a `truncate` class. The header is a single `flex items-center gap-2` row containing the Sparkles tile, the title, and the "This week" chip. On a 360–390px phone viewport the title hits the chip and gets clipped instead of wrapping.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) — confirms the same header is shared by all three variants

## Approach

Two small adjustments in [`SeasonalPicksCard.tsx`](../../src/components/seasonal/SeasonalPicksCard.tsx) Header (lines 326-356):

1. **Drop `truncate` on the `<h2>`** — let it wrap to two lines on narrow viewports. Replace with `flex-1 min-w-0` so the title takes available space without overflowing.
2. **Hide the "This week" chip below `sm` breakpoint** — change `inline-flex` to `hidden sm:inline-flex` on the chip span. On phones the title is already "Sow & grow this week", so the chip is redundant; the page header on `/weekly` and `/dashboard` provide the date context.

Result on mobile: full title visible on one or two lines, no chip. On tablets+: title + chip side-by-side as today.

## Files modified

| File | Change |
|------|--------|
| [`src/components/seasonal/SeasonalPicksCard.tsx`](../../src/components/seasonal/SeasonalPicksCard.tsx) | Drop `truncate`, add `flex-1 min-w-0` to title; hide chip on `<sm` |

## Tests

- No backend / state / data changes.
- Visual regression only — verify by checking `/dashboard` and `/weekly` on phone viewport.

## Deploy

- Frontend-only.
- Minor bump → 21.0007.

## Risks

- Tiny. Title wrapping to two lines is the standard responsive behaviour; chip hides cleanly behind a Tailwind breakpoint.
