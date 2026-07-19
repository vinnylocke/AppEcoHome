# Weather Tab

> 7-day forecast for the home location, plus active weather alerts (frost / heat / wind / heavy rain). Drives recommendations across the rest of the app.

**Route:** `/dashboard?view=weather`
**Source files (entry points):**
- `src/App.tsx` (lines ~1195–1273) — Weather sub-tab render block
- `src/components/WeatherForecast.tsx` — the 7-day strip
- `src/components/WeatherAlertBanner.tsx` — alerts banner

---

## Quick Summary

The Weather Tab shows the next 7 days at your home's lat/lng (set during onboarding via postcode + country). Each day shows min/max temp, precipitation chance, wind speed, and the matching weather icon. Above the forecast, any active `weather_alerts` rows render as banner cards with severity colour, title, and recommended action.

---

## Role 1 — Technical Reference

### Component graph

```
/dashboard?view=weather (App.tsx)
├── WeatherAlertBanner          ← when alerts.length > 0
│   └── per-alert card
├── (loading) skeleton cards
└── WeatherForecast
    ├── 7 daily cards (today + 6)
    │   ├── Date label
    │   ├── Weather icon (mapped from WMO code)
    │   ├── High / Low temp
    │   ├── Precip chance
    │   └── Wind speed
    └── Hourly chart (current day expanded)
```

### Props

WeatherForecast receives:
- `rawWeather` — full snapshot JSONB from `weather_snapshots`
- `isForecastScreen` — true for the Weather tab, false on inline displays (affects layout density)

### Data flow — read paths

#### `weather_snapshots` table

Read by `fetchDashboardData()` (parent). Selected as:

```ts
supabase.from("weather_snapshots")
  .select("data, updated_at")
  .eq("home_id", homeId)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Shape of `data` JSONB (Open-Meteo response):

```json
{
  "current": { "temperature_2m": 18.4, "weathercode": 3, ... },
  "hourly":  { "time": [...], "temperature_2m": [...], ... },
  "daily":   { "time": [...], "temperature_2m_min": [...], "temperature_2m_max": [...], "weathercode": [...], "precipitation_sum": [...], "windspeed_10m_max": [...] }
}
```

Cached in `sessionStorage.weather_cache_<homeId>` for fast first paint.

#### `weather_alerts` table

```ts
supabase.from("weather_alerts")
  .select("id, severity, title, description, kind, expires_at")
  .eq("home_id", homeId)
  .or("expires_at.is.null,expires_at.gt.now()");
```

### Data flow — write paths

None directly from this tab. Alerts are written by `analyse-weather` edge function (server-side cron).

### Edge functions invoked

| Function | When | Input | Output |
|----------|------|-------|--------|
| `sync-weather` | Hourly cron, NOT called from this surface | `{ homeId }` | Writes a `weather_snapshots` row |
| `analyse-weather` | After sync-weather, NOT called from this surface | `{ homeId }` | Writes / updates `weather_alerts` rows |

### Cron / scheduled jobs that affect this surface

| Cron | Cadence | Effect |
|------|---------|--------|
| `sync-weather` | Hourly | Pulls latest forecast from Open-Meteo; writes `weather_snapshots` |
| `analyse-weather` | Hourly (chained after sync) | Evaluates `_shared/weatherRules/*` (frost / heat / wind / heavy rain / dry spell) and inserts / updates `weather_alerts` |

### Weather rules

Each rule in `_shared/weatherRules/` exports an `evaluate(ctx: WeatherContext): WeatherRuleResult` pure function. Imported via the `WEATHER_RULES` barrel (`_shared/weatherRules/index.ts`) to avoid circular imports.

Common rules:
- **frost** — overnight min < 2°C
- **heatwave** — 3+ consecutive days max > 28°C
- **strong_wind** — daily max wind > 40 kph
- **heavy_rain** — daily precip > 25 mm
- **dry_spell** — 7+ days with precip < 1 mm

### Realtime channels

`weather_snapshots` and `weather_alerts` are filtered on `home_id` via the home realtime provider. New rows trigger a Dashboard refresh.

### Tier gating

No gating — Weather tab content is the same for every tier.

### Beta gating

None.

### Permissions / role-based UI

None on this surface — read-only display.

### Error states

| State | Result |
|-------|--------|
| No `weather_snapshots` row | Empty state: "Weather not available yet. Make sure your home has a postcode." |
| Home has no lat/lng | Sync-weather cron skips this home; same empty state |
| Stale snapshot (> 24h old) | Still rendered; the cron should have caught it — staleness flagged by `updated_at` display |
| Open-Meteo API failure | Sync cron retries on next run; user sees the last-good snapshot |

### Performance notes

- Forecast is a single read; no heavy computation client-side.
- Sun events (sunrise / sunset / golden hour) computed locally via `suncalc` library — no server call.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

Weather is the input nothing in the garden ignores. The Weather Tab gives you a one-week look-ahead — when to water (or skip watering, because rain's coming), when to cover (frost), when to harvest (before a heatwave wilts the courgettes). For beginners, the alert banners do the thinking — "frost tonight, cover seedlings." For experts, the daily strip is the canvas you mentally lay your plans against: when's the next rain, the next dry spell, the next wind risk?

### Every flow on this view

#### 1. Glance the alerts

- **What you see:** at the top, any active alerts as horizontal banner cards — red severity for severe, amber for moderate, blue for informational.
- **What you do:** read them. They include the recommended action.
- **Why a gardener cares:** these are the actionable weather events. Frost in two days = cover tender plants today. Heatwave in three = harvest leafy greens early.

#### 2. Read the 7-day forecast

- **What you see:** 7 cards across (or scrolling on narrow screens). Today's card includes hourly detail; the others are summary.
- **What each card shows:** weather icon, day name, high / low temp, precipitation %, wind speed.
- **Why a gardener cares:** the precipitation chance tells you whether to water. Wind speed tells you whether to delay spraying or staking. Temperature swing tells you what to cover.

#### 3. Tap a forecast day (where applicable)

- Expands hourly detail for that day where present in the snapshot — useful for "when's the rain actually hitting?"

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Alert title | Generated by the `analyse-weather` rule that fired |
| Alert severity | `severe` = take action today; `moderate` = plan ahead; `info` = good to know |
| Daily temp (e.g. "8 / 18°C") | min / max for that day |
| Precipitation chance % | Open-Meteo's precipitation_probability_max |
| Wind speed | Open-Meteo's daily max wind in km/h |
| Weather icon | Mapped from Open-Meteo's WMO weathercode |
| "Last updated X ago" | When the cron last ran sync-weather for this home |

### Tier-by-tier experience

Identical for every tier.

### New user vs returning user vs power user

- **Brand new user**: forecast shows but no alerts yet (cron hasn't run for them). Pull-to-refresh on dashboard nudges the data along.
- **Returning user**: weather is "always there." Alerts are the active read.
- **Power user with multiple homes**: switching home in the HomeDropdown reloads weather for the new home's lat/lng.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Treating the precipitation % as a guarantee.** Open-Meteo's probability is regional. Microclimate (your shaded yard vs the weather station's open meadow) means actual rainfall varies. Use alongside your own observations.
- **Forgetting the home's lat/lng matters.** If weather isn't loading, your postcode probably didn't geocode. Home Management → set postcode again.
- **Assuming the alerts cover everything.** The rules are a fixed list — frost, heat, wind, heavy rain, dry spell. Subtler events (sudden temperature drop, late spring frost a few days out) aren't always flagged.

### Recommended workflows

- **Daily glance:** check banners first → only worth checking the daily strip if you're planning beyond today.
- **Pre-planning a planting day:** look 5–7 days out for a calm, dry-ish day. Plan the planting tasks for that day.
- **Frost prep:** as soon as a frost alert appears, walk through your tender plants and cover what needs covering.

### What to do if something looks wrong

- **No weather showing at all:** check `homes.lat` / `homes.lng` in your home record. If null, postcode geocoding failed. Re-enter postcode in Home Management.
- **Forecast looks wildly wrong (e.g. yesterday's data):** the cron may be paused or rate-limited. Check the Audit Log if you have admin.
- **Alert doesn't match your local reality:** the rules use Open-Meteo data which is regional. File feedback so we can adjust thresholds per-region.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md)
- [Weather Alert Banner](./08-weather-alert-banner.md)
- [Microclimate Report](../03-garden-hub/07-microclimate-report.md)
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)

## Code references for ongoing maintenance

- `src/components/WeatherForecast.tsx` — forecast component
- `src/components/WeatherAlertBanner.tsx` — alert banner
- `supabase/functions/sync-weather/index.ts` — hourly cron
- `supabase/functions/analyse-weather/index.ts` — alert generation
- `supabase/functions/_shared/weatherRules/*.ts` — pure rule functions
- `supabase/functions/_shared/weatherRules/index.ts` — barrel export (avoid circular imports!)
- `supabase/migrations/*weather*` — weather schema
