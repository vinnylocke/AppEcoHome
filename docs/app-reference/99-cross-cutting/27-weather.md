# Weather — Open-Meteo, Snapshots, Rules

> Weather data comes from Open-Meteo (free, no key) via the `sync-weather` cron. Snapshots stored in `weather_snapshots` per home. `analyse-weather` cron runs rule modules to generate `weather_alerts` (frost, heatwave, heavy rain, wind, dryness) plus derived stats.

---

## Quick Summary

```
sync-weather (cron, hourly)
└── for each home with lat/lng:
    ├── skip if snapshot fresher than 55 min (freshness guard)
    └── fetch Open-Meteo (current + 7-day forecast)
        └── upsert weather_snapshots row

analyse-weather (cron, hourly)
├── expire stale alerts (is_active=false where ends_at < now()-24h)
└── for each weather_snapshot:
    └── for each rule in _shared/weatherRules/:
        └── evaluate(ctx) → WeatherRuleResult
            ├── insert / update weather_alerts
            └── notifications: one row PER home member (user_id set,
                weatherAlerts pref honoured), deduped per day on type:title
```

**sync-weather freshness guard is 55 min, not 60:** each home's snapshot is stamped mid-run (home #50 gets stamped minutes past the hour), so a full one-hour guard made late-listed homes alternate skip/update at the hourly cron — effectively 2-hour weather.

**analyse-weather notification fan-out (2026-07-02):** weather-alert notifications are now inserted one row per home member **with `user_id`** — `push-webhook` drops rows without one, so the old home-level rows never delivered as push. Each member's `weatherAlerts` pref is checked via `shouldNotify`. Cross-run dedup is keyed on `type:title` (was type-only, which suppressed every *different* same-day weather event after the first, since all rules emit type `weather_alert`). See [Notifications](./12-notifications.md).

### Alert lifecycle (Wave 21.0004)

`analyse-weather` only upserts NEW alerts on `(location_id, type)` — if conditions stop matching the rule, the previous row sits there with `is_active = true` forever. So the function begins each run with a sweep that flips `is_active = false` on any row whose **`ends_at`** (the last affected day) is more than 24 hours in the past — so a multi-day heatwave/frost stays active until its final day, not just day one. The 24-hour grace window keeps morning rain alerts visible the rest of the day.

Conversely, the per-run upsert sets `is_active = true` on every alert it writes — so a row the sweep previously deactivated **reappears the moment its rule fires again** (without this, a re-triggered heatwave stayed hidden because the upsert left `is_active` untouched).

Defence-in-depth: every read site that surfaces alerts to the user (the WeatherAlertBanner fetch in `App.tsx`, the TodayFocusCard's hasHeatAlert check) also applies `is_active = true` + `ends_at >= now()-24h` filters. The historical `useGardenReport` queries intentionally include deactivated rows (they're counting monthly totals).

**Garden Intelligence panel** (`WeatherForecast.tsx`) re-derives the rules client-side for display; its heat threshold uses the same climate-aware logic via `src/lib/heatThreshold.ts` (mirror of the server helper — UK = 25°C) and scans the whole forecast week, not just today+tomorrow.

### Forward window, grouped days, climate-aware heat (2026-06)

- **Forward-looking + grouped.** `heatwave` and `highWind` scan the WHOLE daily forecast (not just today+tomorrow) and collect every matching day; `frostRisk` keeps the imminent 48h hourly check AND scans the daily min for further frost nights. Each alert carries `dates` (jsonb array of YYYY-MM-DD) + `ends_at`, so the WeatherAlertBanner renders one grouped line per type ("Heatwave — Mon–Wed", "Frost — Fri & Sat") via `src/lib/weatherDates.ts` `formatDateRange`. A run of 3+ consecutive hot days is labelled a "heatwave"; isolated days are "hot day(s)".
- **Climate-aware heat threshold.** The flat 25°C is replaced by `heatThresholdForClimate(zone, country)` (`_shared/climateZones.ts`): tropical 36 → subtropical 34 → mediterranean 32 → warm_temperate 30 → cool_temperate 28 → continental 28 → subarctic 26 → arctic 25 (default 28). **UK override:** any UK home (`home.country` ∈ United Kingdom/GB/England/Scotland/Wales/Northern Ireland) uses the Met Office heatwave baseline of **25°C**, regardless of zone — because the latitude bands split the UK across cool_temperate (S England) and continental (N England + Scotland). `analyse-weather` threads `WeatherContext.climateZone` (from `home.climate_zone` ?? `deriveClimate(lat).zone`) and `WeatherContext.country` (`home.country`).
- **Prompt display.** Alerts stay on the hourly cron (no realtime), but the dashboard tab-focus refetch throttle was relaxed from 5 min → 60 s (`App.tsx`), so returning to the app surfaces fresh alerts within ~1 minute.

---

## Role 1 — Technical Reference

### `weather_snapshots` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `home_id` | uuid | FK |
| `data` | jsonb | Open-Meteo response (current + daily + hourly) |
| `derived` | jsonb | Computed stats (frost risk, etc.) |
| `updated_at` | timestamptz | |

### `weather_alerts` columns

| Column | Type | Notes |
|--------|------|-------|
| `home_id` | uuid | |
| `alert_type` | text | frost / heatwave / heavy_rain / wind / dry |
| `severity` | text | mild / moderate / severe |
| `starts_at`, `ends_at` | timestamptz | Window |
| `payload` | jsonb | Extras (e.g. min temp, rainfall amount) |
| `status` | text | active / cleared |

### Weather rule modules (`_shared/weatherRules/`)

Each exports a pure `evaluate(ctx: WeatherContext): WeatherRuleResult`:

```ts
function evaluate({ snapshot, locationMeta, ... }) {
  return {
    alert_type, severity, starts_at, ends_at, payload,
  } | null;
}
```

Detected rules (illustrative):
- `frostRule`
- `heatwaveRule`
- `heavyRainRule`
- `windRule`
- `dryPeriodRule`

**Important:** Always import via `WEATHER_RULES` barrel (`_shared/weatherRules/index.ts`), never individual files — circular import TDZ otherwise.

### Open-Meteo endpoint

```
https://api.open-meteo.com/v1/forecast
  ?latitude=...&longitude=...
  &current=...&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,...
  &hourly=...,precipitation_probability,precipitation,...&timezone=auto
```

**2026-06-17:** hourly `precipitation` (mm/h) was added to the fetch so weather-defer automations can sum expected rain inside the recheck window (`_shared/weatherForecast.ts` → `computeRainWindow`) instead of leaning on the daily total. `readForecast(db, homeId, now, windowHours, minProbability, heatThresholdC)` resolves the rain window + heatwave flag the automation evaluators use. See [Automations](../07-management/06-integrations-automations.md).

### Data flow

Browser typically reads `weather_snapshots` directly:

```ts
supabase.from("weather_snapshots")
  .select("data, derived, updated_at")
  .eq("home_id", homeId)
  .order("updated_at", desc)
  .limit(1)
  .maybeSingle();
```

### Frost / wind helpers

`src/lib/garden/microclimate.ts`:
- `classifyFrostRisk(forecastDay)` → "None"/"Mild"/"Moderate"/"Severe"
- `computeWindExposure(shape, allShapes)` → "Sheltered"/"Partly Sheltered"/"Exposed"

### Used by

- Dashboard Weather tab
- WeatherAlertBanner
- Microclimate Report Modal
- Garden Layout overlays (Frost, Wind)

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Weather is the single biggest external input for gardening. Frost kills tender plants; heatwave dries beds. Rhozly surfaces what's coming so you can act.

### Implications

- Set home lat/lng accurately for relevant alerts.
- Alerts persist until cleared by the next sync that determines the window has passed.

---

## Related reference files

- [Weather Tab](../02-dashboard/04-weather-tab.md)
- [Weather Alert Banner](../02-dashboard/08-weather-alert-banner.md)
- [Microclimate Report](../03-garden-hub/07-microclimate-report.md)
- [Cron Jobs](./11-cron-jobs.md)

## Code references for ongoing maintenance

- `supabase/functions/sync-weather/index.ts`
- `supabase/functions/analyse-weather/index.ts`
- `supabase/functions/_shared/weatherRules/`
- `src/lib/garden/microclimate.ts`
- `supabase/migrations/*_weather_snapshots.sql`, `*_weather_alerts.sql`
