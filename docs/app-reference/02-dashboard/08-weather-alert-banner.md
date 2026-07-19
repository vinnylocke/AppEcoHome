# Weather Alert Banner

> A horizontal banner stack at the top of the Dashboard / Weather tab showing any active weather alerts (frost, heatwave, strong wind, heavy rain, dry spell).

**Rendered on:** **app-wide** — a slim `compact` bar at the top of every padded screen (in `App.tsx`'s `<main>`), plus the **full** always-on banner on the Weather view (`/dashboard?view=weather`, `isForecastScreen=true`). The compact bar is hidden on the Weather view (no doubling) and on focus-mode screens. Each compact row is tappable → opens the Weather view, with a per-type dismiss ✕.
**Source file:** `src/components/WeatherAlertBanner.tsx`

---

## Quick Summary

Reads the `alerts` prop (an array of `weather_alerts` rows) and renders one card per alert, colour-coded by severity. The banner uses different layouts depending on whether it's on a tight content area (Dashboard top strip) or the Weather tab (full forecast screen).

**Grouped days (2026-06):** each card shows the day(s) the alert spans, derived from the row's `dates` array via `src/lib/weatherDates.ts` `formatDateRange` — "Today", "Tomorrow", a consecutive run "Mon–Wed", a pair "Fri & Sat", or a disjoint list. Frost (which carries a real hourly time) also appends the time for a single imminent night; heat/wind use a noon placeholder so no time is shown. Icons: frost ❄ `Snowflake`, heat 🌡️ `ThermometerSun`, wind `Wind`, rain `CloudRain` (the `heat` type is now handled — it previously fell through to the rain icon). The `App.tsx` fetch filters on `ends_at >= now()-24h` (so a multi-day alert stays visible until its last day) and refetches on tab-focus throttled to 60 s.

---

## Role 1 — Technical Reference

### Component graph

```
WeatherAlertBanner
└── For each alert:
    ├── Severity icon (frost ❄ / heat 🔥 / wind 💨 / rain ☔ / dry 🌵)
    ├── Title (rule-generated short string)
    ├── Description (recommended action)
    └── Dismiss-for-this-session button (LS-backed)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `alerts` | `Array<{ id, severity, title, description, kind, expires_at }>` | App.tsx state.alerts | Active alerts for the home |
| `isForecastScreen` | `boolean` | App.tsx (only true on Weather sub-tab) | Affects layout density |

### Data flow — read paths

Receives `alerts` as a prop. No direct queries.

The alerts originate from:

```ts
supabase.from("weather_alerts")
  .select("id, severity, title, description, kind, expires_at")
  .eq("home_id", homeId)
  .or("expires_at.is.null,expires_at.gt.now()");
```

This is fetched by `home-dashboard-stats` (server-side) and surfaces to the App.tsx state.alerts.

### Data flow — write paths

**Per-type, per-day dismissal (2026-06).** Dismissing an alert stores `localStorage["dismissed-weather-alerts"]` as a map of alert **type → the local date dismissed** (`{ heat: "2026-06-23" }`). An alert type stays hidden **app-wide only for that calendar day**; the next day it reappears if the alert is still active — a gentle reminder, not spam. The alert is never deleted from the DB. The **Weather view ignores dismissal entirely** (`isForecastScreen`). Pure helpers in `src/lib/weatherAlertDismissal.ts` (`isDismissedToday` / `dismiss` / `parseDismissed`, the last dropping the legacy permanent id-array format). (Replaces the earlier permanent localStorage id-array model.)

### Edge functions invoked

None directly. Alerts are written upstream by `analyse-weather`.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `sync-weather` | Provides snapshot data |
| `analyse-weather` | Inserts / updates `weather_alerts` rows; sets `expires_at` so alerts auto-clear |

### Realtime channels

Subscribes via parent (`useHomeRealtime`) to `weather_alerts` table inserts / updates. New alert pops in without refresh.

### Tier gating

None. Weather alerts are not AI-tier gated.

### Beta gating

None.

### Permissions / role-based UI

None — read-only display.

### Error states

| State | Result |
|-------|--------|
| `alerts.length === 0` | Banner doesn't render |
| Alert with no description | Title shows; description div omitted |
| Expired alert (`expires_at < now`) | Server query excludes these — banner never sees them |

### Performance notes

- Pure render of props. Costless.
- Session dismissal uses sessionStorage to avoid leaking across browser sessions.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why look at this banner

Weather alerts are the single most actionable piece of information in Rhozly. When a frost alert fires for tomorrow night, that's the difference between losing your seedlings or covering them in time. When a heatwave alert fires for the weekend, that's the cue to mulch heavily and harvest leafy greens early. The banner sits at the top because *this is what changes everything else*.

### Every flow on this banner

#### 1. Read the title

- Short rule-generated string: "Frost expected tonight (-1°C)", "Heatwave Sat–Mon (29°C)", "Strong winds Wed (45 kph)", "Heavy rain Thu (28mm)", "Dry spell continues (12 days)".

#### 2. Read the description

- The recommended action. "Cover tender plants tonight." / "Mulch and harvest leafy greens before Saturday." / "Stake tall plants and skip foliar sprays Wed." / "Skip watering Thu and Fri." / "Resume regular watering schedule despite cool weather."

#### 3. Dismiss (session only)

- Removes the alert from your current session. It won't reappear until you refresh / open a new tab / the underlying alert is updated by the next cron run.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Icon | Mapped to the alert `kind` (frost / heatwave / strong_wind / heavy_rain / dry_spell) |
| Title | Rule-generated headline |
| Description | Rule-generated recommended action |
| Severity colour | Red = severe (act today); amber = moderate (plan ahead); blue = info |
| Expires badge | Optional — when the alert is time-bound |

### Tier-by-tier experience

Identical. Weather alerts are universal.

### New user vs returning user vs power user

- **Brand new user**: may see no alerts at all until the first cron has run for their home (could take up to an hour). After that, banner appears on relevant days.
- **Returning user**: alerts come and go with weather patterns. Spring frost is the most common.
- **Power user**: may dismiss alerts they've already acted on rather than read them every visit.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Ignoring alerts because "the weather forecast says different."** The alerts are derived from the same forecast data — they're a curated subset. If they disagree, it's likely the data was refreshed since you last checked.
- **Treating session dismissal as permanent.** It's not — the alert resurfaces next session.
- **Believing the alert covers all weather risks.** It only covers the rule set we've implemented (frost / heat / wind / heavy rain / dry spell). Subtle risks (humidity, sudden temp drops) aren't included.

### Recommended workflows

- **Glance + act:** read the banner first thing → if severe, plan today's gardening around it.
- **Dismiss after acting:** once you've covered the seedlings, dismiss the frost alert so the banner stays clean.

### What to do if something looks wrong

- **Alert says frost but the forecast says +5°C:** the alert was generated from older snapshot data. Pull-to-refresh; if it persists, the cron may be stuck. Open the Audit Log to check.
- **Expected alert isn't showing:** the rule threshold may not be tripped (frost rule fires under 2°C only). Or the cron hasn't run yet for your home.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md)
- [Weather Tab](./04-weather-tab.md)
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)

## Code references for ongoing maintenance

- `src/components/WeatherAlertBanner.tsx` — entire component
- `supabase/functions/analyse-weather/index.ts` — alert generation
- `supabase/functions/_shared/weatherRules/*.ts` — pure rules
- Schema: `weather_alerts(id, home_id, severity, title, description, kind, expires_at, created_at)`
