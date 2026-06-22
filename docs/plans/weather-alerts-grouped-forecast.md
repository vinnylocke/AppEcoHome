# Weather alerts — forward window, grouped dates, prompt display

## Goal

Make weather alerts (heat, frost, wind, rain) feel like a real forecast:

1. **Look further ahead** — not just today + tomorrow, so an upcoming heatwave shows before it lands.
2. **Group by type with the days it applies to** — one line per type: "Heatwave — Mon–Wed", "Frost — Fri & Sat", instead of a single timestamp.
3. **Show the date(s)/time** clearly for each event.
4. **Surface promptly** — when the weather cron writes new alerts, the app reflects them (near-)immediately rather than only on the next manual refetch.

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/27-weather.md` — rule pipeline, alert lifecycle, stale-out sweep.
- `docs/app-reference/02-dashboard/08-weather-alert-banner.md` — banner data flow + what's shown.
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — `sync-weather` / `analyse-weather` cadence.
- `docs/app-reference/99-cross-cutting/15-realtime.md` — realtime channel patterns (for prompt display).

## How it works today (the starting point)

- **Pipeline:** `sync-weather` (hourly) → `weather_snapshots`; `analyse-weather` (hourly) runs `_shared/weatherRules/*` → upserts `weather_alerts`.
- **Windows:** heat (`heatwave.ts`) + wind (`highWind.ts`) scan **today + tomorrow only** (`.slice(0,2)`, first match); frost (`frostRisk.ts`) scans the **next 48h** hourly; rain is yesterday+today.
- **Schema:** `weather_alerts(id, location_id, type, message, severity, starts_at, is_active, created_at)` with `UNIQUE(location_id, type)` → **one row per type per location**, one `starts_at`.
- **Display:** `WeatherAlertBanner` dedupes to one alert per type, shows `starts_at` as "Today/Tomorrow at HH:MM". **No grouping, no realtime** — it refetches on dashboard load, tab-refocus (5-min throttle), or pull-to-refresh (realtime deliberately excluded for `weather_alerts` per scalability Wave D).
- **Stale-out:** `analyse-weather` flips `is_active=false` on rows whose `starts_at` is >24h old.

## The change

### 1. Rules scan a forward window + collect all matching days

- `heatwave.ts` / `highWind.ts`: scan the full daily forecast (today … +7d), collect **every** day over threshold (not just the first), and return the matching dates + the peak value. A run of ≥3 consecutive hot days is labelled a "heatwave"; isolated hot days stay "hot day".
- `frostRisk.ts`: keep the 48h hourly check for the imminent-frost time, **and** add the daily-min frost days across the window so the banner can say "Frost — Fri & Sat".
- Extend the shared `WeatherRuleResult` shape (`weatherRules/index.ts`) so a result can carry `dates: string[]` (YYYY-MM-DD) and `endsAt` alongside the existing `starts_at`/message/severity/type.

> **Threshold — DECIDED: climate-aware.** Replace the flat 25°C with a per-home threshold derived from the home's climate zone (`home.climate_zone`, falling back to `deriveClimate(lat).zone`). New helper `heatThresholdForClimate(zone)` in `_shared/climateZones.ts`: tropical 36°C → subtropical 34 → mediterranean 32 → warm_temperate 30 → cool_temperate 28 → continental 28 → subarctic 26 → arctic 25 (default 28). Thread `climateZone` into `WeatherContext`.

### 2. Schema — represent the days an alert spans

New migration adds to `weather_alerts`:
- `dates jsonb` — array of affected dates (`["2026-06-23","2026-06-24","2026-06-25"]`).
- `ends_at timestamptz` — last affected moment (for stale-out + range display).

Keep `UNIQUE(location_id, type)` (one grouped row per type). Existing table is grandfathered for Data-API grants; new columns need none. Backfill `dates = [starts_at::date]` / `ends_at = starts_at` for existing rows.

### 3. `analyse-weather` writes the range + fixes stale-out

- Upsert `dates` + `ends_at` from the rule result.
- **Stale-out must key on `ends_at`, not `starts_at`** — otherwise a Mon–Wed heatwave alert expires after Monday. Sweep `is_active=false` where `coalesce(ends_at, starts_at) < now()-24h`. Mirror the same `ends_at` filter at every read site.

### 4. Banner — render grouped days

- `WeatherAlertBanner`: keep one-per-type, but render the day list from `dates[]` via a new pure helper `formatDateRange(dates)` (`src/lib/weatherDates.ts`) → "Mon–Wed", "Fri & Sat", "Tue, Thu", or "Today" / "Tomorrow at HH:MM" for single imminent events. Unit-tested.
- Update the `WeatherAlert` interface + the `App.tsx` query to select `dates, ends_at` and filter on `ends_at >= now()-24h`.

### 5. Prompt display when the cron runs

**DECIDED: relax the refetch throttle (no realtime).** Keep `weather_alerts` off realtime (preserves the Wave-D scaling choice). Lower the dashboard tab-focus refetch throttle in `App.tsx` from **5 minutes → 60 seconds**, so returning to the app surfaces fresh alerts within ~1 minute of the hourly cron writing them — without per-client realtime cost.

## Files to change

- `supabase/functions/_shared/weatherRules/{heatwave,highWind,frostRisk}.ts` + `index.ts` (result type)
- `supabase/functions/analyse-weather/index.ts` (write range, fix stale-out)
- `supabase/migrations/<ts>_weather_alert_dates.sql` (add `dates`, `ends_at`, backfill)
- `src/components/WeatherAlertBanner.tsx` + `src/lib/weatherDates.ts` (new formatter)
- `src/App.tsx` (alert query columns + filter; dashboard realtime subscription)

## Tests

- Deno: update `heatwave.test.ts`, `highWind.test.ts`, `frostRisk.test.ts` for multi-day collection + `dates[]`/`endsAt` output; add a stale-out-by-`ends_at` case.
- Vitest: `weatherDates.test.ts` for `formatDateRange` (single day, consecutive run → "Mon–Wed", disjoint → "Tue, Thu", today/tomorrow, empty).
- Playwright: extend the dashboard/weather spec — seed a multi-day heat alert (`04_weather.sql`) and assert the grouped banner renders the day range.

## Docs to update

- `27-weather.md` (windows, range model, stale-out-by-ends_at), `08-weather-alert-banner.md` (grouped display + realtime), `11-cron-jobs.md` / `15-realtime.md` (new realtime channel), `01-seeded-fixtures.md` + the weather e2e-test-plan section, `TESTING.md` inventory.

## Risks / decisions

- **Stale-out keying on `ends_at` is load-bearing** — get it wrong and multi-day alerts vanish after day one (called out above).
- **Realtime on `weather_alerts`** reverses a deliberate Wave-D exclusion; scoped to the dashboard + filtered by location it's cheap, but if we'd rather not add any realtime, the fallback is to shorten/relax the tab-focus refetch throttle (cheaper, slightly less "instant").
- **Heat threshold (25°C)** is low for "heatwave" — left as-is here; flag for a follow-up if the grouped copy should distinguish "warm spell" vs "heatwave".
- Multi-day ranges with gaps are handled by `dates[]` (a list), not a single start/end span.
