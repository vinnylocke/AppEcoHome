# 37. Calendar Section (CalendarHub)

**Spec files:** `tests/e2e/specs/dashboard.spec.ts` · `tests/e2e/specs/weather.spec.ts` · `tests/e2e/specs/navigation-deeplinks.spec.ts` · `tests/e2e/specs/schedule.spec.ts` · `tests/e2e/specs/calendar-window.spec.ts` · `tests/e2e/specs/tasks.spec.ts`
**Page Objects:** `tests/e2e/pages/DashboardPage.ts` (`gotoCalendar()` → `/calendar`, `gotoWeather()` → `/calendar?tab=weather`) · `tests/e2e/pages/CalendarPage.ts` (`goto()` → `/calendar`) · `tests/e2e/pages/SchedulePage.ts` (`goto()` → `/calendar?tab=routines`)
**Seed dependencies:** `00_bootstrap.sql`, `01_locations_areas.sql`, `03_tasks_blueprints.sql`, `04_weather.sql`
**App-reference:** [Calendar Section (CalendarHub)](../app-reference/02-dashboard/19-calendar-section.md) · [Calendar Tab](../app-reference/02-dashboard/03-calendar-tab.md) · [Weather Tab](../app-reference/02-dashboard/04-weather-tab.md) · [Routines / Blueprint Manager](../app-reference/04-planner/07-blueprint-manager.md)

> Created 2026-07-24 (#12 IA reorg). The top-level **Calendar section**
> (`CalendarHub`, `src/components/CalendarHub.tsx`) unifies three
> time-and-schedule surfaces under `/calendar` with a `SegmentedTabs` switcher
> (`calendar-hub-switch`; tabs `calendar-hub-tab-calendar` /
> `calendar-hub-tab-weather` / `calendar-hub-tab-routines`, each `role="tab"`):
>
> - **Calendar** (default, `?tab=` absent) → `TaskCalendar`
> - **Weather** (`?tab=weather`) → full `WeatherAlertBanner` (`isForecastScreen`) + `WeatherForecast`; the app-wide compact weather-alert bar is **suppressed** on this tab
> - **Routines** (`?tab=routines`) → `BlueprintManager` rendered **`embedded`**
>
> Calendar + Weather **left the Dashboard** (its three-tab `?view=` switcher and
> the `dashboard-view-switcher` testid were deleted); Routines **left the
> Planner** and the standalone `/schedule` route. Legacy
> `/dashboard?view=calendar|weather` and `/schedule` links **redirect** in so
> nothing breaks.
>
> **Note — where the rows physically live:** most **CAL-\*** rows still live in
> `tests/e2e/specs/dashboard.spec.ts` (they predate this section and were not
> physically moved when it was created); the **Weather** rows live in
> `dashboard.spec.ts` / `weather.spec.ts` / `tasks.spec.ts`; the **Routines**
> functional coverage is the whole **SCH-\*** suite documented in
> [07-schedule.md](./07-schedule.md), which now runs against
> `/calendar?tab=routines`. This file is the canonical per-surface index for the
> Calendar section and cross-references those homes rather than duplicating every
> row.

## Section render + legacy redirects

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CAL-001 | ✅ | `/calendar` → Calendar grid visible (the default tab; clean URL, no `?tab=`) | — | ✅ Passing |
| CAL-001b | ✅ | Legacy redirects (#12, URLs never die) — `/dashboard?view=calendar&date=…` → `/calendar` (date carried); `/dashboard?view=weather` → `/calendar?tab=weather` | — | ✅ Passing |
| CAL-011 | ✅ | Section tab switcher — at `/calendar` on a phone, `calendar-hub-switch` shows the Calendar / Weather / Routines tabs; the deleted `dashboard-view-switcher` has count 0 (replaces the old DASH-MOBILE-001) | — | ✅ Passing |
| NAV-002 | ✅ | `/schedule` (+ legacy `?category=`) redirects to `/calendar?tab=routines`, dropping `?category=` (`navigation-deeplinks.spec.ts`) | — | ✅ Passing |
| NAV-004 | ✅ | `/dashboard?view=calendar&date=YYYY-MM-DD` → `/calendar` with the date consumed + stripped by `TaskCalendar` (`navigation-deeplinks.spec.ts`) | — | ✅ Passing |

## Calendar tab (default — TaskCalendar)

> `DashboardPage.gotoCalendar()` → `/calendar`. Rows physically in `dashboard.spec.ts`. `TaskCalendar` is unchanged by #12 — it still consumes `?open=add-task` / `?date=` and strips them.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CAL-002 | ✅ | Current month heading | — | ✅ Passing |
| CAL-003 | ✅ | Task dots render on dates with tasks | — | ✅ Passing |
| CAL-004 | ✅ | Ghost task dots for blueprint recurring dates | — | ✅ Passing |
| CAL-005 | ✅ | Click a date with tasks updates the agenda panel to that date | — | ✅ Passing |
| CAL-006 | ✅ | Click Add Task opens the New Task modal (pre-filled from the selected date) | — | ✅ Passing |
| CAL-007 | ✅ | Next month button advances (aria-label `/Next (month\|week)/`) | — | ✅ Passing |
| CAL-008 | ✅ | Previous month button goes back (aria-label `/Previous (month\|week)/`) | — | ✅ Passing |
| CAL-009 | ✅ | Completed task date shows the completed indicator | — | ✅ Passing |
| CAL-010 | ✅ | Skipped task is not shown as pending in the agenda | — | ✅ Passing |

Harvest-window visualisations (`CAL-W20-001..005`, `calendar-window.spec.ts` / `harvest-window.spec.ts`) also navigate to `/calendar` since #12 — documented in [05-dashboard.md](./05-dashboard.md) under "Calendar harvest-window visualisations".

## Weather tab (`?tab=weather` — WeatherAlertBanner + WeatherForecast)

> `DashboardPage.gotoWeather()` → `/calendar?tab=weather`. The app-wide compact weather-alert bar is **suppressed** here (CalendarHub renders the full always-on banner instead — `isCalendarWeatherTab` in `App.tsx`). GI-panel + forecast-icon rows physically in `dashboard.spec.ts` / `weather.spec.ts` / `tasks.spec.ts`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-003 | ✅ | Weather forecast panel visible at `/calendar?tab=weather` | — | ✅ Passing |
| DASH-005..009 | ✅ | Weather-code forecast icons render correctly (WMO 0 clear, 61 rain, 71 snow, 95 thunder, 45 fog) | — | ✅ Passing |
| DASH-015 | ✅ | Garden Intelligence panel heading visible on the Weather tab | — | ✅ Passing |
| DASH-016..019 | ✅ | GI rules — auto-watering, frost protection, heatwave, high wind | — | ✅ Passing |
| TASK-020 | ✅ | "Outdoor watering auto-completed" visible in the GI panel (`tasks.spec.ts`, opens `/calendar?tab=weather`) | — | ✅ Passing |

## Routines tab (`?tab=routines` — BlueprintManager embedded)

> `SchedulePage.goto()` → `/calendar?tab=routines`; `BlueprintManager` renders **`embedded`** (all `schedule-*` / `blueprint-*` testids unchanged, so the existing page object works untouched). Since #12 BlueprintManager only ever renders embedded — the standalone `?open`/`?category`/`?tab` deep-link path is skipped inside the hub (it would otherwise strip the hub's own `?tab=routines`). Full functional coverage is the **SCH-\* suite** in [07-schedule.md](./07-schedule.md), which now runs against this tab.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NAV-002 | ✅ | `/schedule` redirects to `/calendar?tab=routines` (bookmarks / notifications / help links kept alive) | — | ✅ Passing |
| SCH-001..* | ✅ | Routines list render / CRUD / pause / filter / Optimise — the whole SCH suite, now hosted embedded in this tab (see [07-schedule.md](./07-schedule.md)) | `03_tasks_blueprints.sql` | ✅ Passing |

## Related

- App reference: [Calendar Section (CalendarHub)](../app-reference/02-dashboard/19-calendar-section.md), [Calendar Tab](../app-reference/02-dashboard/03-calendar-tab.md), [Weather Tab](../app-reference/02-dashboard/04-weather-tab.md), [Routines / Blueprint Manager](../app-reference/04-planner/07-blueprint-manager.md)
- Test plans: [05-dashboard.md](./05-dashboard.md) (the now home-only Dashboard + the physical home of the CAL-* / weather rows), [07-schedule.md](./07-schedule.md) (the Routines functional suite)
- Routing: [21-routing.md](../app-reference/99-cross-cutting/21-routing.md)
