# Plan — Move "What to grow this week" off Quick Access Home, onto /weekly

## Context

User reports still seeing "What to grow this week" on the "today quick link" after the 21.0004 deploy removed it from `LocalizedTaskCalendar` (`/quick/calendar`). Confirmed by grep: the only remaining mobile placement is in [`QuickAccessHome.tsx:267`](../../src/components/QuickAccessHome.tsx#L267) (carousel variant), which is what's visible on the `/quick` landing page. The user wants it removed from there and added to the Weekly Overview page (`/weekly`) instead.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) — current placements (Dashboard + Quick Launcher carousel), card variants ("dashboard" | "carousel" | "today" — last one already retired)
- [`docs/app-reference/02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) — component graph (the carousel sits between WalkStartTile and the "Open full dashboard" footer)
- [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) — Weekly Overview structure (seven sections), where the new card belongs in the flow

## Approach

### 1. Remove from QuickAccessHome

Delete the `SeasonalPicksCard` block at [`QuickAccessHome.tsx:265-269`](../../src/components/QuickAccessHome.tsx#L265-L269) and the matching import + reference in the component graph comments. The `aiEnabled`/`isPremium` props are still consumed by other children (the props signature stays).

### 2. Add to WeeklyOverviewPage

Mount `<SeasonalPicksCard variant="dashboard">` as a new section on `/weekly`, slotted between the existing "Sow this week" deterministic chip strip and "Ready to harvest". The deterministic sow list (from `sowing_calendar`) and the personalised picks (from the `seasonal_picks` plant-doctor action with deterministic fallback) are complementary — sow chips are a quick-glance count; the picks card is the rich "why these for you" exploration. Keeping both means the page has the snapshot AND the deeper recommendation in one place.

Visually consistent with the existing weekly sections (rounded-3xl, same horizontal padding) — the card already has its own header so it sits naturally as a section.

### 3. Keep on Dashboard

No change to [`HomeDashboard.tsx:566`](../../src/components/HomeDashboard.tsx#L566). The desktop dashboard is the canonical home for the card; this is just moving the mobile placement.

## Files modified

| File | Change |
|------|--------|
| [`src/components/QuickAccessHome.tsx`](../../src/components/QuickAccessHome.tsx) | Delete SeasonalPicksCard block + import |
| [`src/components/WeeklyOverviewPage.tsx`](../../src/components/WeeklyOverviewPage.tsx) | Mount SeasonalPicksCard as a new section between Sow and Harvest |
| [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md) | Update placements: drop `/quick`, add `/weekly` |
| [`docs/app-reference/02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) | Remove SeasonalPicksCard from the component graph |
| [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) | Add SeasonalPicksCard to the page section list |

## Tests

- No backend changes, no migrations, no edge functions.
- Vitest: not needed (pure mount-position change).
- E2E (docs only): update `docs/e2e-test-plan.md` to reflect the new placement.

## Deploy

- Frontend-only: `vercel --prod`.
- Standard minor bump → 21.0005.

## Risks

- Tiny. The carousel variant on `/quick` was a power-user shortcut; users who relied on it now reach the same data via `/weekly` (one tap from the dashboard pill / Quick Launcher / Sunday push notification).
- No data layer touched.
