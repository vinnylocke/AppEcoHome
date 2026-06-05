# Weather — Open-Meteo, Snapshots, Rules

> Weather data comes from Open-Meteo (free, no key) via the `sync-weather` cron. Snapshots stored in `weather_snapshots` per home. `analyse-weather` cron runs rule modules to generate `weather_alerts` (frost, heatwave, heavy rain, wind, dryness) plus derived stats.

---

## Quick Summary

```
sync-weather (cron, hourly)
└── for each home with lat/lng:
    └── fetch Open-Meteo (current + 7-day forecast)
        └── upsert weather_snapshots row

analyse-weather (cron, hourly)
├── expire stale alerts (is_active=false where starts_at < now()-24h)
└── for each weather_snapshot:
    └── for each rule in _shared/weatherRules/:
        └── evaluate(ctx) → WeatherRuleResult
            └── insert / update weather_alerts
```

### Alert lifecycle (Wave 21.0004)

`analyse-weather` only upserts NEW alerts on `(location_id, type)` — if conditions stop matching the rule, the previous row sits there with `is_active = true` forever. So the function now begins each run with a sweep that flips `is_active = false` on any row whose `starts_at` is more than 24 hours in the past. The 24-hour grace window keeps morning rain alerts visible the rest of the day.

Defence-in-depth: every read site that surfaces alerts to the user (the WeatherAlertBanner fetch in `App.tsx`, the TodayFocusCard's hasHeatAlert check) also applies `is_active = true` + `starts_at >= now()-24h` filters. The historical `useGardenReport` queries intentionally include deactivated rows (they're counting monthly totals).

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
  &current=...&daily=temperature_2m_min,temperature_2m_max,...
  &hourly=...&timezone=auto
```

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
