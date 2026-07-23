# Hemisphere & Seasonality

> All seasonal date calculations respect `hemisphere: "northern" | "southern"`. Northern summer = June–August; Southern summer = December–February. The `home.country` + lat is used to derive hemisphere; per-user override via profile.

---

## Quick Summary

```
src/lib/seasonal.ts
├── getHemisphere(country?, timezone?, lat?) → "northern" | "southern"
├── getFrequencyDays(wateringTerm) → number
├── normalizePeriods(input) → string[] (shape normalisation only — no shifting)
└── getSinglePeriodRange(period, hemisphere) → { start, end } MM-DD (SH month shifting lives here)

src/lib/plantScheduleFactory.ts
└── buildAutoSeasonalSchedules(plant, hemisphere) → plant_schedules "Seasonal:MM-DD" refs
```

> **Drift fix (2026-07-23):** this summary previously listed `getSeason(date, hemisphere)` (which does not exist anywhere) and placed `buildAutoSeasonalSchedules` in `seasonal.ts` (it lives in `plantScheduleFactory.ts`). Corrected above.

### Annual carry-over — seasonal windows repeat each year (Track B, 2026-07)

Seasonal boundaries are FIXED month/day (`getSinglePeriodRange` returns the same MM-DD every year, hemisphere-shifted — no weather/ripeness input), which is exactly what makes year-over-year carry-over deterministic. A `task_blueprints.recurrence_kind = 'annual'` blueprint treats its stored start/end as a MM-DD template that `projectAnnualWindows` (`src/lib/windowTasks.ts`) rolls into each occurrence year — so a harvest/pruning/seasonal-watering window opens on the **same dates every year**, only the year advancing (leap-day 02-29 → 02-28; southern hemisphere is the northern windows shifted +6 months). See [Data Model — Tasks](./04-data-model-tasks.md#annual-carry-over--recurrence_kind-track-b-2026-07).

---

## Role 1 — Technical Reference

### `getHemisphere(country?, timezone?, lat?)`

Inputs, in precedence order:
- `lat` — **authoritative when provided** (finite, non-zero): `lat < 0` → southern. The country list is only a heuristic that misclassifies much of the southern hemisphere.
- `country` + `timezone` — fallback substring match against an expanded southern-country list (Australia, New Zealand, South Africa, Brazil, Argentina, Chile, Peru, Uruguay, Paraguay, Bolivia, Ecuador, Indonesia, Madagascar, Zimbabwe, Namibia, Botswana, Mozambique, Zambia, Malawi, Angola, Tanzania, Fiji, Papua New Guinea, Samoa, Vanuatu).

Returns `"northern" | "southern"` (default northern).

### Season boundaries

| Season | Northern | Southern |
|--------|----------|----------|
| Spring | Mar 1 – May 31 | Sep 1 – Nov 30 |
| Summer | Jun 1 – Aug 31 | Dec 1 – Feb 28/29 |
| Autumn | Sep 1 – Nov 30 | Mar 1 – May 31 |
| Winter | Dec 1 – Feb 28/29 | Jun 1 – Aug 31 |

### `normalizePeriods(input)` + `getSinglePeriodRange(period, hemisphere)`

`normalizePeriods(input)` only normalises provider period data (string / array / object shapes) into a `string[]` — it does **no** hemisphere shifting.

The shifting lives in `getSinglePeriodRange(period, hemisphere)`, which resolves a period string to an `{ start, end }` MM-DD range:

- **Explicit month names** ("June") are calibrated to the northern hemisphere by the plant providers (Perenual / Verdantly), so they're shifted **+6 months for southern users** — otherwise an Australian tomato gets a midwinter "June harvest" blueprint. (Season names like "summer" were already hemisphere-shifted; explicit months now are too.)
- **Month ranges** ("June to August") span first→last mentioned month instead of truncating to the first match — and the range wraps the year boundary for SH when the shift pushes it across (e.g. "June to August" → Dec–Feb).

```ts
getSinglePeriodRange("June", "southern")           // → { start: "12-01", end: "12-31" }
getSinglePeriodRange("June to August", "southern") // → { start: "12-01", end: "02-28" }
```

### Wrap-around month windows (`scheduleFromSchedulableTask`)

`src/lib/scheduleFromSchedulableTask.ts` now handles month windows that wrap the year boundary (`["Nov","Dec","Jan"]` — every SH summer window does). Plain min/max used to collapse such windows to Jan..Dec = "active all year", producing "sow now" tasks in midwinter. The window start is now the month after the largest cyclic gap between the sorted months, the end is the month before that gap, and active/end-date math follows the (possibly wrapping) first→last window across the year boundary.

### `buildAutoSeasonalSchedules(plant, hemisphere)`

Generates per-plant seasonal blueprints (e.g. "plant in spring", "prune after fruiting") shifted for hemisphere.

### Server-side hemisphere — `update-plant-states`

The `update-plant-states` cron mirrors the lat-first rule: hemisphere prefers `homes.lat` (`lat < 0` → southern, when finite and non-zero) and only falls back to an **expanded** southern country/timezone list (Uruguay, Paraguay, Bolivia, Indonesia, Madagascar, Zimbabwe, Namibia, Botswana, Mozambique, Zambia, Tanzania, Fiji, Papua New Guinea added to the original 7). The old 7-country list ran most southern-hemisphere homes' growth-state transitions 6 months out of phase.

### Local "today" — client-wide sweep

All ~30 client-side `new Date().toISOString().split("T")[0]` "today" sites now use `getLocalDateString` (the user's **local** calendar day). The UTC date flips at the wrong wall-clock moment — a UTC+10 user at 8am got "yesterday", a UTC−5 user at 11pm got "tomorrow" — skewing overdue badges, calendar anchors, schedule floors and more.

`src/lib/plantScheduleGenerator.ts` is the one exception in mechanism (not behaviour): it inlines its own `localTodayStr()` so it stays a pure date-math module with no supabase-adjacent import. It also replaced `+365d`/`+730d` arithmetic with **calendar-year addition** (`addYears` via `setUTCFullYear`) for the seasonal year-roll and the annual/biennial blueprint end caps — a span containing 29 Feb landed the rolled date one day early.

### Used by

- Home Setup → captures hemisphere via country.
- PlantAssignmentModal → smart schedules.
- generate-tasks cron → respects seasonal windows.
- update-plant-states cron → growth state transitions tied to seasons.
- `lookup_frost_dates` edge fn action (Mobile Quick Access Wave 3) → hemisphere derivation drives the frost-date prompt + the server-side validation in `_shared/frostValidation.ts`. Cached frost dates live in `home_climate` per home with a 6-month TTL. See [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md).

### Edge cases

- **Equatorial users** (within ~5° of equator): hemisphere matters less. Default to northern; rules less prescriptive.
- **Migrating between hemispheres** (a user moves home): hemisphere can change via Home Settings.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Without hemisphere awareness, an Australian user would get "plant tomatoes in May" advice meant for the UK — disastrous. Rhozly handles it transparently.

### Implications

- Your home's country drives hemisphere by default.
- Provider data (Perenual) is northern-hemisphere by default; Rhozly shifts it for you.
- Seasonal task scheduling adapts.

---

## Related reference files

- [Home Setup](../01-onboarding/03-home-setup.md)
- [Home Climate Settings](../07-management/04-climate-settings.md)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md)

## Code references for ongoing maintenance

- `src/lib/seasonal.ts`
- `src/lib/scheduleFromSchedulableTask.ts` — month-window → blueprint dates (wrap-around aware)
- `src/lib/plantScheduleFactory.ts` — uses `buildAutoSeasonalSchedules`
- `src/lib/plantScheduleGenerator.ts` — local-today floor + leap-safe `addYears` caps
- `supabase/functions/update-plant-states/index.ts` — lat-first hemisphere, paged planted-items scan
