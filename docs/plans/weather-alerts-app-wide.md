# Weather alerts — app-wide compact bar + daily-reappear dismissal

## Goal

Show active weather alerts **on every screen** as a slim, dismissable bar (not just inside the dashboard), have a dismissal **reappear the next day if the alert is still valid** (gentle reminder, not spam), and keep the **full always-on banner in the Weather section**.

User decisions: compact bar app-wide · dismiss = that alert **type** for the **day**.

## App-reference consulted

- `docs/app-reference/02-dashboard/08-weather-alert-banner.md` (banner data flow, dismissal, `isForecastScreen`)
- `docs/app-reference/99-cross-cutting/27-weather.md` (alert lifecycle, `ends_at` validity)

## Current state

- `WeatherAlertBanner` is rendered only inside the dashboard (3 sites in `App.tsx`). Other routes have no banner.
- Dismissal is **permanent**: `localStorage["dismissed-weather-alerts"]` is an array of alert ids, never expiring.
- The Weather view already always-shows (the banner's `isForecastScreen` branch ignores dismissal). `info`-severity alerts are never shown in the banner (they live in Garden Intelligence).
- App-wide `alerts` state already lives in `AppShell`; there's a `<main id="main-content">` wrapping the routed content.

## Changes

### 1. Per-type, per-day dismissal (pure, tested)
New `src/lib/weatherAlertDismissal.ts`:
- Storage shape `Record<alertType, "YYYY-MM-DD">` (the local date the type was dismissed).
- `isDismissedToday(map, type, today)`, `dismiss(map, type, today)`, `load()`, `save()`.
- An alert type is hidden app-wide only while `map[type] === todayLocal`; a new day → not dismissed → reappears (if the alert is still active in `alerts`).
- Migrate the legacy `string[]` format gracefully (if it's an array, reset to `{}`).
- `WeatherAlertBanner` swaps its permanent `dismissedIds` array for this map; the Weather section (`isForecastScreen`) still ignores dismissal.

### 2. Compact bar variant
Add a `compact` prop to `WeatherAlertBanner`:
- Renders each active (non-dismissed-today) alert **type** as a slim one-line row: severity icon + grouped when-label + short message (e.g. "Heatwave — Mon–Wed"), severity-tinted.
- Tapping a row navigates to `/dashboard?view=weather`; a dismiss **✕** on each row dismisses **that type** for the day.
- No `info` alerts (reuse the existing `visibleAlerts` filter).
- The full (existing) card layout is unchanged and used in the Weather section.

### 3. Global placement
- Render the compact bar once at the top of `<main id="main-content">` so it appears on **every** route: `{!isWeatherView && <WeatherAlertBanner alerts={alerts} compact />}` (hidden on the Weather view, which shows the full one).
- `isWeatherView` derived from the route/`?view=` param via `useLocation`/the existing `dashboardView`.
- **Weather view** keeps the **full** always-on banner (existing render, `isForecastScreen`). 
- **Consolidate the dashboard's 3 inline render sites:** the full banner renders only on the Weather view; the non-weather dashboard tabs (and all other routes) get the global compact bar instead — so no screen shows two banners.

## Files
- `src/lib/weatherAlertDismissal.ts` — **new** (pure dismissal helper).
- `src/components/WeatherAlertBanner.tsx` — per-day dismissal + `compact` variant.
- `src/App.tsx` — global compact bar in `<main>`; make the full banner Weather-view-only; remove the now-duplicate inline renders.

## Tests
- **Vitest** `tests/unit/lib/weatherAlertDismissal.test.ts` — dismissed-today vs new-day reappear, per-type isolation, legacy-array migration.
- **Playwright** — extend the dashboard/weather spec: compact bar appears on a non-weather route, dismiss hides it, the Weather view still shows the full banner. (Seeded heat alert from `04_weather.sql`.)

## Docs
- `08-weather-alert-banner.md` (app-wide compact bar + per-day dismissal + which screen shows which variant), a note in `27-weather.md`, `TESTING.md`, e2e-test-plan.

## Notes / edge cases
- "Still valid" = the alert is still in `alerts` (App fetches only `is_active` + `ends_at >= now-24h`), so daily-reappear is automatic once dismissal expires.
- The compact bar is intentionally hidden on the Weather view to avoid doubling with the full banner there.
- Keeping `info` alerts out of both variants (unchanged) — they remain in Garden Intelligence.
