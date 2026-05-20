# Hemisphere & Seasonality

> All seasonal date calculations respect `hemisphere: "northern" | "southern"`. Northern summer = June–August; Southern summer = December–February. The `home.country` + lat is used to derive hemisphere; per-user override via profile.

---

## Quick Summary

```
src/lib/seasonal.ts
├── getHemisphere(country | lat) → "northern" | "southern"
├── getSeason(date, hemisphere) → "spring" | "summer" | "autumn" | "winter"
├── normalizePeriods(periods, hemisphere) → shifted dates for SH users
└── buildAutoSeasonalSchedules(plant, hemisphere) → blueprints
```

---

## Role 1 — Technical Reference

### `getHemisphere(country, lat?)`

Inputs:
- `country` (preferred — strict mapping for known countries)
- `lat` (fallback — sign determines hemisphere)

Returns `"northern" | "southern"`.

### Season boundaries

| Season | Northern | Southern |
|--------|----------|----------|
| Spring | Mar 1 – May 31 | Sep 1 – Nov 30 |
| Summer | Jun 1 – Aug 31 | Dec 1 – Feb 28/29 |
| Autumn | Sep 1 – Nov 30 | Mar 1 – May 31 |
| Winter | Dec 1 – Feb 28/29 | Jun 1 – Aug 31 |

### `normalizePeriods(periods, hemisphere)`

When provider data (Perenual, Verdantly) lists months for planting / harvest / pruning windows assuming Northern Hemisphere, this helper shifts the months by 6 for SH users.

```ts
normalizePeriods([3, 4, 5], "southern") // → [9, 10, 11]
```

### `buildAutoSeasonalSchedules(plant, hemisphere)`

Generates per-plant seasonal blueprints (e.g. "plant in spring", "prune after fruiting") shifted for hemisphere.

### Used by

- Home Setup → captures hemisphere via country.
- PlantAssignmentModal → smart schedules.
- generate-tasks cron → respects seasonal windows.
- update-plant-states cron → growth state transitions tied to seasons.

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
- `src/lib/plantScheduleFactory.ts` — uses `buildAutoSeasonalSchedules`
- `supabase/functions/update-plant-states/index.ts`
