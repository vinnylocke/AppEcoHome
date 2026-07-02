# Daily Brief Card

> The hero card at the top of the Dashboard. Time-of-day greeting + a synthesised one-liner about today + tappable stat chips for tasks / weather / sun / frost + a footer with zone, microclimate, and "ask AI" CTAs.

**Route:** rendered inline on `/dashboard?view=dashboard`
**Source file:** `src/components/DailyBriefCard.tsx`

---

## Quick Summary

A gradient hero card with five-ish stat chips that summarise the gardening day. It pulls together task counts, weather, sun events, and frost risk so the user gets the "what matters today" snapshot without reading numbers off four different surfaces.

---

## Role 1 — Technical Reference

### Component graph

```
DailyBriefCard
├── Greeting row
│   ├── Date label
│   ├── "Good [morning/afternoon/evening], [FirstName]"
│   └── Weather icon (when weather loaded)
├── Headline summary line ("Today: 3 tasks · 18°C · frost expected tonight")
├── Stat chips grid (2 cols mobile, 4 on sm+)
│   ├── Today / Overdue tasks chip
│   ├── Current temp chip
│   ├── Golden hour chip (when in / approaching golden hour)
│   ├── Sunset chip (when not in golden hour)
│   └── Frost chip (when tonight's min < 2°C)
└── Footer row
    ├── Zone chip (when hardinessZone known)
    ├── Microclimate chip
    ├── Free-text climate hint ("Sunrise was 06:14 · day length 13h 22m")
    ├── "Got a plant question?" chip (opens Plant Doctor chat — only when aiEnabled)
    └── "Open today's calendar" link
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `firstName` | `string \| null` | `profile?.first_name` | Greeting personalisation |
| `weather` | `{ temp, summary, icon, ... } \| null` | Extracted from rawWeather in App.tsx | Current weather |
| `rawWeather` | `WeatherSnapshot["data"] \| null` | App.tsx state | For tomorrow's frost detection |
| `locations` | `Array<{ lat?, lng? }>` | App.tsx state.locations | Fallback for sun events if home lat/lng missing |
| `alerts` | `Array<{ severity?, title? }>` | App.tsx state.alerts | Conditional alert hint in footer |
| `todayTaskCount` | `number` | Aggregated from `locationTaskCounts` | Today chip |
| `overdueCount` | `number` | App.tsx state.overdueTaskCount | Overdue chip (replaces Today if > 0). Home-scoped (RHO-3); the query now runs even for homes with **zero locations** — it was inside the locations branch and cached a hard 0 for location-less homes |
| `homeLat`, `homeLng` | `number \| null` | App.tsx state.homeLatLng | For sun calculations |
| `hardinessZone` | `number \| null` | App.tsx state.hardinessZone | Zone chip |
| `aiEnabled` | `boolean` (default `false`) | `!!profile?.ai_enabled` in App.tsx | Gates the "Got a plant question?" chat chip (RHO-11). Wrapped in `{aiEnabled && (…)}`; gated together with the global chat FAB in App.tsx (RHO-10) |

### Local state

| State | Source | Purpose |
|-------|--------|---------|
| `now` | `new Date()` | Computed once per render — drives greeting + day-length string |
| `sun` | useMemo | `SunCalc.getTimes(now, homeLat, homeLng)` — local sun calculations |
| `goldenAM`, `goldenPM` | derived | Golden hour windows (sunrise / sunset ± 60min) |
| `isCurrentlyInGoldenHour` | derived | now falls inside either window |
| `goldenHourComingUp` | derived | within 2h of next golden hour |
| `frostHint` | derived | from rawWeather.daily — tonight's min < 2°C. The daily array is keyed on the **local** date (`getLocalDateString(now)`), not the UTC date — Open-Meteo `daily.time` entries are local-to-location, so the UTC key flipped at the wrong wall-clock moment (evenings in the Americas read tomorrow's min; mornings east of UTC read yesterday's) |

### Data flow — read paths

The card is purely a render of props + computed locals. No fetches.

The `usePlantDoctor` context provides `setIsOpen` + `setPageContext` for the "Got a plant question?" chip.

### Data flow — write paths

- Tapping "Got a plant question?" calls `setPageContext({...})` then `setIsOpen(true)` — opens Plant Doctor chat with today's context loaded as a system message.

### Edge functions invoked

None directly. `setIsOpen(true)` opens the chat overlay which then invokes `plant-doctor-ai` lazily.

### Cron / scheduled jobs that affect this surface

Indirectly via App.tsx's data:
- `sync-weather` → drives the weather icon, temp chip, frost detection
- `generate-tasks` → drives the today / overdue counts

### Realtime channels

None directly — all data piped in via props from App.tsx which subscribes upstream.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | "Got a plant question?" chip is hidden (chat is AI-only). Enforced via the `aiEnabled` prop (RHO-11) — gated together with the global chat FAB (RHO-10) so a Sprout user has no chat entry point at all |
| Botanist | Same as Sprout |
| Sage | "Got a plant question?" chip visible |
| Evergreen | Same as Sage |

### Beta gating

None.

### Permissions / role-based UI

None.

### Error states

| State | Result |
|-------|--------|
| No weather loaded | Weather icon and temp chip omitted; rest of card renders |
| No home lat/lng | Sun chips omitted; sunrise/day-length text omitted |
| No hardiness zone | Zone chip omitted |
| All counts zero | Today chip still shows "0 tasks" — does not hide |

### Performance notes

- SunCalc is < 1 KB and runs synchronously — no perceptible cost.
- Memoised so unrelated parent re-renders don't recompute sun.
- Greeting `now` recomputes on every render but only when the user interacts — fine.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open / look at this card

For a beginner, the Daily Brief is the most important piece of UI in the app — it answers "do I need to do anything today, and is the weather going to mess with my plans?" without making them think. For an experienced gardener, it's a 60-second status read while the kettle boils.

### Every flow on this card

#### 1. Read the greeting

- Personalised: "Good morning, Sarah." Falls back to "Good morning" when no first name set. Time-of-day swap happens at 05:00 / 12:00 / 18:00.

#### 2. Read the headline summary

- "Today: 3 tasks · 18°C · frost expected tonight" — synthesised one-liner. Designed to be read in two seconds.

#### 3. Tap a chip

| Chip | What happens |
|------|--------------|
| Today / Overdue tasks | Jumps to `/dashboard?view=calendar` with today selected |
| Temp (Now) | Jumps to `/dashboard?view=weather` |
| Golden hour | Jumps to Sun Tracker `/sun-trajectory?mode=ar` |
| Sunset | Jumps to Sun Tracker |
| Frost (Tonight) | Jumps to Weather tab |
| Zone N | Jumps to Home Management |
| Microclimate | Jumps to Garden Layouts |
| Got a plant question? | Opens Plant Doctor chat with today's context loaded |
| Open today's calendar | Jumps to Calendar |

#### 4. Read the footer hint

- When no alerts: "Sunrise was 06:14 · day length 13h 22m" — useful for knowing how much daylight you've got for outdoor work.
- When alerts: "⚠ Heavy rain forecast Thursday" — pulled from the first active alert.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Greeting | Time-of-day mapped to morning / afternoon / evening |
| Date string | en-GB long-form date |
| Weather icon | Open-Meteo current weather code → icon |
| Today X tasks chip | `todayTaskCount` from sum of `locationTaskCounts` |
| Overdue X tasks chip (amber bg) | When `overdueCount > 0`, replaces Today chip |
| Now Y°C chip | Current temperature from rawWeather.current.temperature_2m |
| Golden hour "Now" or "16:42" | Either currently inside the window or shows next start |
| Sunset HH:MM | Today's sunset |
| ❄ X°C (Tonight) | Tonight's min temp, only shown when < 2°C |
| Zone N | USDA hardiness zone from `homes.hardiness_zone` |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | All chips except the AI chat one |
| Botanist | Same |
| Sage / Evergreen | Includes "Got a plant question?" |

### New user vs returning user vs power user

- **Brand new user**: only the greeting + zone chip render until weather data loads (first hourly sync hasn't fired). Tasks chip says "0 tasks". This is fine — it's an early-state surface.
- **Returning user**: full Daily Brief renders within ~1 second of opening the dashboard.
- **Power user**: footer climate hint is the most-read line — sunrise / day length is genuine planning info.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Mistaking the temp chip for "outside right now."** It's the latest hourly snapshot from Open-Meteo's regional data. Your microclimate may differ.
- **Frost chip only shows under 2°C.** Borderline frosts (2.5°C) won't flag. Some sensitive plants damage at 4°C — watch the daily strip in the Weather tab yourself for those.
- **Golden hour is for photos, not gardening tasks.** It's there to nudge you to capture progress, not to schedule pruning.

### Recommended workflows

- **30-second morning check:** Greeting → headline → tap the highest-priority chip → handle the action.
- **Frost evening prep:** see frost chip → tap → Weather tab → check tomorrow → cover what needs covering.

### What to do if something looks wrong

- **Greeting says "Gardener" instead of your name:** open Account Settings and set your first name.
- **Weather icon missing:** weather snapshot hasn't loaded for your home. Set / re-enter postcode in Home Management.
- **Today chip says 0 but you know you have tasks:** counts are filtered to today only. Open the Calendar tab.

---

## Related reference files

- [Dashboard Tab](./01-dashboard-tab.md)
- [Calendar Tab](./03-calendar-tab.md)
- [Weather Tab](./04-weather-tab.md)
- [Sun Tracker AR](../03-garden-hub/08-sun-tracker-ar.md)
- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md)

## Code references for ongoing maintenance

- `src/components/DailyBriefCard.tsx` — entire component
- `node_modules/suncalc` — sun events library
- `src/App.tsx` — passes props in
