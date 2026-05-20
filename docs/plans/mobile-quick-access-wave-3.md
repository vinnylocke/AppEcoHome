# Wave 3 — Localized Task Calendar

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md) · prev: [Wave 2](./mobile-quick-access-wave-2.md) (shipped)

## Goal

Light up the "Today" tile in [Quick Access Home](../app-reference/02-dashboard/09-quick-access-home.md). Builds a phone-first **Localized Task Calendar** at `/quick/calendar` that answers three questions in one scroll:

1. **What do I need to do today?** (today's tasks, compact)
2. **Will it rain — do I actually need to water?** (rainfall vs open watering tasks)
3. **What can I plant right now, and how?** (frost-aware planting calendar with AI helper)

```
┌──────────────────────────────────────┐
│  ← Quick           Today's Calendar  │
│                                       │
│  🌱 Plant something                  │ ← AI helper card (frost-aware)
│  ┌──────────────────────────────┐   │
│  │ What do you want to plant?    │   │
│  │ [tomato_____________] [Go]    │   │
│  │ Last frost: 12 Apr · First: 26 │   │
│  │ Oct · Zone 8b                  │   │
│  └──────────────────────────────┘   │
│                                       │
│  💧 Rain & watering today            │ ← synthesised advice
│  ┌──────────────────────────────┐   │
│  │ Skip watering — 8mm rain     │   │
│  │ expected by 6pm.              │   │
│  └──────────────────────────────┘   │
│                                       │
│  📋 Today's tasks (4)                │ ← TaskList compact
│  ┌──────────────────────────────┐   │
│  │ • Water tomatoes              │   │
│  │ • Prune basil                 │   │
│  │ • Harvest courgette           │   │
│  │ • Check seedlings             │   │
│  │ [View calendar →]             │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

The full Dashboard, Calendar, and Schedule routes stay untouched — this is an additive shortcut layer.

## App-reference files consulted

- [02-dashboard/03-calendar-tab.md](../app-reference/02-dashboard/03-calendar-tab.md) — the full calendar; the compact version mirrors its data layer (TaskEngine.fetchTasksWithGhosts).
- [02-dashboard/04-weather-tab.md](../app-reference/02-dashboard/04-weather-tab.md) — current rain/forecast display; the compact summary borrows its precip math.
- [02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — parent screen; the Today tile becomes live in this wave.
- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — the edge fn we extend with two new actions.
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — TaskEngine + ghost tasks contract.
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — where the two new actions get catalogued.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini wrapper + caching patterns we follow.
- [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — pattern for the new `home_climate` RLS policy.
- [99-cross-cutting/27-weather.md](../app-reference/99-cross-cutting/27-weather.md) — `weather_snapshots` shape (we read it, we don't write it).
- [99-cross-cutting/29-seasonality.md](../app-reference/99-cross-cutting/29-seasonality.md) — hemisphere derivation. Frost-date prompt threads `home.country` + hemisphere.

Source files studied:
- `src/components/TaskList.tsx` (1598 lines) — extends with a `compact` prop.
- `src/components/WeatherForecast.tsx` (868 lines) — borrowed precip helpers; not directly reused (too heavyweight for compact UI).
- `src/components/HomeDashboard.tsx` — current `<TaskList homeId={homeId} />` mount site; the compact variant mirrors the same call signature.
- `supabase/functions/plant-doctor/index.ts` — single action-discriminated edge fn (Wave 1 + 2 added `analyse_comprehensive`); Wave 3 adds two more actions here.

## Decisions

### Decision 1 — `home_climate` is one row per home, refreshed lazily

```sql
CREATE TABLE home_climate (
  home_id                 uuid PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE,
  -- AI-derived fields (refreshed on 6-month TTL via lookup_frost_dates)
  last_frost_iso          date,             -- "average date of last spring frost"
  first_frost_iso         date,             -- "average date of first autumn frost"
  growing_season_days     int,              -- computed convenience
  notes                   text,             -- AI free-text caveat for the home
  last_frost_lookup_at    timestamptz,      -- NULL until first lookup
  -- User-editable rain-advice thresholds (defaults seeded from existing weatherRules)
  rain_skip_mm            numeric NOT NULL DEFAULT 5,   -- ≥ this 48h rainfall → suggest skip watering
  rain_water_mm           numeric NOT NULL DEFAULT 1,   -- < this 48h rainfall → suggest water today
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
-- hardiness_zone stays on the `homes` table (existing column, owned by Climate Settings).
```

RLS:
- Service role: full write access (the edge fn writes).
- Authenticated members of the home: SELECT only.

A row exists only after the first lookup for that home. Refresh happens lazily when `now() - last_frost_lookup_at > 180 days` OR `last_frost_lookup_at IS NULL`.

### Decision 2 — Two new plant-doctor edge fn actions

Add to `supabase/functions/plant-doctor/index.ts` (same single function, same `action` discriminator pattern Wave 1 used):

**`lookup_frost_dates({ homeId })`** — returns the cached row, refreshes if stale. Idempotent: same call within 6 months → cache hit, zero Gemini cost. NOT AI-tier-gated (the cached row is treated as a fact, not a generation; all tiers see their home's frost dates). Schema:

```ts
{
  last_frost_iso: string;        // "2026-04-12"
  first_frost_iso: string;       // "2026-10-26"
  hardiness_zone: string | null; // from `homes.hardiness_zone` (NOT regenerated)
  growing_season_days: number;
  notes: string | null;
  rain_skip_mm: number;          // also returned so the calendar screen has all climate data in one call
  rain_water_mm: number;
  from_cache: boolean;           // true if cache hit, false if just regenerated
}
```

Prompt uses `home.country + lat + lng + hemisphere + hardiness_zone + current year` → Gemini returns the AI-derived fields only. Server-side validation (sane month ranges per hemisphere) before writing.

**`plant_when_to_plant({ plantName, homeId })`** — uses the cached frost dates (calls `lookup_frost_dates` internally if missing) to scope advice. Schema:

```ts
{
  plant_name: string;
  scientific_name: string | null;
  can_plant_outdoors_now: boolean;
  earliest_outdoor_date: string;    // ISO date
  latest_outdoor_date: string;      // ISO date
  indoor_start_recommended: boolean;
  indoor_start_date: string | null; // ISO date
  spacing_cm: number | null;
  depth_cm: number | null;
  sun_requirement: string;          // "full sun" / "partial shade" / etc
  tips: string[];                   // 2-4 concrete tips
}
```

Costs: one Gemini call per lookup, rate-limited via `enforceRateLimit` like every other AI action. Frost-date result feeds back into the prompt as context so timing advice is calibrated to the home.

### Decision 3 — Reuse `TaskList` with a new `compact` prop

`TaskList` already accepts `homeId`, `targetDate`, `selectedTypes`, etc. Adding `compact?: boolean` is consistent with how the rest of the props work.

In compact mode:
- Show only **pending** tasks (no completed tab, no bulk-edit toolbar, no scope filter).
- Limit to **today's** tasks (sets `targetDate = today` internally).
- Render rows in a slim style: title + small icon + tap-to-complete checkbox. No expanded actions.
- Add a **"View calendar →"** link at the bottom that routes to `/dashboard?view=calendar`.

Default `compact = false` → every existing call site (HomeDashboard, etc.) is byte-identical.

### Decision 4 — Don't reuse `WeatherForecast`; build a slim `RainWaterAdvice` tile

`WeatherForecast` is 868 lines and pulls heavy charts + alert rendering — way over what the compact tile needs. The compact tile only needs:

- Today's rain mm (existing `weather_snapshots.data.daily.precipitation_sum[0]`)
- Tomorrow's rain mm (`[1]`)
- Count of today's open watering tasks for the user's home

That's a tiny direct query. Building a slim `RainWaterAdvice` component keeps the chunk small and avoids the risk of `WeatherForecast` refactors breaking the mobile screen.

The component synthesises the advice string locally — no AI call:

```ts
const totalRain = todayRain + tomorrowRain;
const wateringTasks = todaysOpenWateringCount;
const { rain_skip_mm, rain_water_mm } = homeClimate; // from home_climate row

if (totalRain >= rain_skip_mm && wateringTasks > 0) {
  return `Skip watering — ${totalRain}mm of rain expected in the next 48h.`;
}
if (totalRain >= rain_skip_mm && wateringTasks === 0) {
  return `${totalRain}mm of rain expected — no watering scheduled, you're set.`;
}
if (totalRain < rain_water_mm && wateringTasks > 0) {
  return `Water today — only ${totalRain}mm forecast.`;
}
return `${totalRain}mm forecast over the next 48h.`;
```

Default thresholds (5mm skip / 1mm water) are seeded in the `home_climate` row at creation time, sourced from the existing waterlog/dryness rules in `_shared/weatherRules/`. Users can override either threshold in Climate Settings (see Decision 8). When no `home_climate` row exists yet, the component falls back to those same hard-coded defaults so the advice still renders on a fresh visit.

### Decision 5 — Frost lookup is silent and automatic on first visit

When `/quick/calendar` mounts, fire `lookup_frost_dates({ homeId })` in the background. On cache hit (the common case after the first visit per home per 6 months) it's a free DB read. On cache miss, one Gemini call (~1-2 seconds), and the planting card shows a tiny "Looking up your frost dates…" spinner until the response arrives.

Rationale: forcing the user to tap a "load frost dates" button would be friction for a feature whose default cost is zero. The "tap to fetch" pattern was an option in the master plan but we already locked in AI-fetched + cached; this Decision 5 just makes the trigger automatic.

### Decision 6 — Planting card sits at the TOP of the calendar screen

The planting card is the most novel feature; today's tasks + rain advice are familiar concepts users can already get from the Dashboard. Putting the new thing first signals what the screen is for.

Order top-to-bottom:
1. Planting Calendar Card (`<PlantingCalendarCard />`)
2. Rain & watering advice (`<RainWaterAdvice />`)
3. Today's tasks (`<TaskList compact homeId={...} />`)

### Decision 8 — Climate Settings tab exposes the rain thresholds

The existing **Climate Settings** tab in `HomeManagement.tsx` (per [07-management/04-climate-settings.md](../app-reference/07-management/04-climate-settings.md)) already edits the home's `country`, `timezone`, `lat/lng`, `hardiness_zone`, etc. Wave 3 extends it with a new **Rain advice** section:

```
🌧 Rain advice thresholds
Skip-watering threshold: [ 5 ] mm
  When the next 48h forecast meets or exceeds this, the Quick Access
  Calendar suggests skipping today's watering.

Water-today threshold: [ 1 ] mm
  When forecast rainfall stays below this, the calendar nudges you to
  water as planned.
```

Two numeric inputs, validated client-side (`rain_water_mm < rain_skip_mm`, both non-negative). Save → upsert `home_climate` row with the new values. Read on screen mount; defaults shown until first save. No new tab; new section inside the existing Climate Settings UI.

### Decision 7 — Validate Gemini output server-side before writing to `home_climate`

Gemini will occasionally hallucinate dates (e.g. "last frost March 30 1999"). The edge fn validates:
- `last_frost_iso` is a valid date in the current year ± 1.
- `last_frost_iso` precedes `first_frost_iso`.
- For Northern hemisphere homes, `last_frost_iso` falls in Jan–May.
- For Southern hemisphere homes, `last_frost_iso` falls in Jul–Nov.

If validation fails, refuse the write and return `{ error: "frost_lookup_validation_failed", details: ... }`. The client surfaces a non-blocking warning toast and the planting card falls back to a generic "Plant when soil is workable" copy.

## File touch list

| File | Status | Change |
|---|---|---|
| `supabase/migrations/<ts>_home_climate.sql` | **NEW** | Create table + RLS. |
| `supabase/functions/plant-doctor/index.ts` | edit | Add `LOOKUP_FROST_DATES_SCHEMA`, `PLANT_WHEN_TO_PLANT_SCHEMA`, two new action handlers, internal cache check + write. |
| `supabase/functions/_shared/frostValidation.ts` | **NEW** | Pure helper: `validateFrostPayload(payload, hemisphere, currentYear) → { ok, reason? }`. |
| `src/services/plantDoctorService.ts` | edit | `lookupFrostDates(homeId)` + `plantWhenToPlant(plantName, homeId)` typed methods. |
| `src/components/quick/LocalizedTaskCalendar.tsx` | **NEW** | The mobile screen. Composes the three sub-cards. |
| `src/components/quick/PlantingCalendarCard.tsx` | **NEW** | Frost dates display + plant-name input + AI result render. |
| `src/components/quick/RainWaterAdvice.tsx` | **NEW** | Computes the advice line from weather + watering-task counts. |
| `src/components/TaskList.tsx` | edit | Accept `compact?: boolean` prop; when true, render the slim variant. |
| `src/App.tsx` | edit | (a) Add `/quick/calendar` route. (b) Add `quick_calendar: "/quick/calendar"` to `TAB_URL`. |
| `src/components/QuickAccessHome.tsx` | edit | The Today tile flips from "Coming soon" to live → `navigate("/quick/calendar")`. |
| `src/components/HomeManagement.tsx` | edit | Climate Settings tab: add a "Rain advice" section with two numeric inputs (`rain_skip_mm`, `rain_water_mm`). Read from / upsert to `home_climate`. |

## App-reference work

| File | Action |
|---|---|
| `docs/app-reference/02-dashboard/10-localized-task-calendar.md` | **CREATE** using `_template.md`. New surface. |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | UPDATE — Today tile is now live, link to the new file. |
| `docs/app-reference/05-tools/02-plant-doctor.md` | UPDATE — add `lookup_frost_dates` + `plant_when_to_plant` to the action table. |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | UPDATE — same two actions. |
| `docs/app-reference/99-cross-cutting/13-ai-gemini.md` | UPDATE — list the new actions. |
| `docs/app-reference/99-cross-cutting/21-routing.md` | UPDATE — add `/quick/calendar`. |
| `docs/app-reference/99-cross-cutting/29-seasonality.md` | UPDATE — link to `home_climate` table. |
| `docs/app-reference/99-cross-cutting/01-data-model-home.md` | UPDATE — mention the new `home_climate` 1-to-1 sibling table. |
| `docs/app-reference/07-management/04-climate-settings.md` | UPDATE — document the new "Rain advice" section + the two new fields. |
| `docs/app-reference/00-INDEX.md` | UPDATE — add the new dashboard reference. |

## Tests

| Tier | What |
|---|---|
| Deno | `frostValidation.ts` — happy path, NH out-of-range, SH out-of-range, last > first, invalid date strings |
| Deno | Mocked plant-doctor `lookup_frost_dates` — cache hit returns existing row, cache miss writes new row, validation failure leaves cache untouched |
| Deno | Mocked plant-doctor `plant_when_to_plant` — confirms it calls `lookup_frost_dates` internally when cache empty, schema-shape sanity check |
| Vitest | `RainWaterAdvice` — four advice variants render correctly based on (rain, watering tasks) input |
| Vitest | `PlantingCalendarCard` — loading state, error state, full result render, submit triggers plantWhenToPlant call |
| Vitest | `LocalizedTaskCalendar` — composes the three sub-cards, top-to-bottom order, back button to /quick |
| Vitest | `TaskList compact` — renders pending-only, hides bulk-edit + scope filter, "View calendar" link present |
| Playwright | `tests/e2e/specs/quick-calendar.spec.ts` — mobile viewport → tap Today tile → land on /quick/calendar → see planting + rain + tasks cards. Submit plant name → AI result renders. |

## Data-safety audit

| Change | Risk |
|---|---|
| New `home_climate` table | None — additive; no existing rows touched. RLS allows home members to SELECT only. |
| Two new plant-doctor actions | None — additive. Existing actions unaffected. |
| `frostValidation.ts` | Pure helper. Server-side guard against bad AI output. |
| `TaskList compact` prop | Defaults false — every existing call site byte-identical. |
| New route + Quick tile activation | Additive; the placeholder toast just becomes a navigate. |
| No data migrations or backfills | The `home_climate` table is empty until the first lookup per home. Existing users' frost-date row is created lazily. |

## Implementation order

1. **Migration** — create `home_climate` with RLS. `supabase migration up` locally, verify, **wait for explicit user OK before `supabase db push`**.
2. **`frostValidation.ts` + Deno test** — pure helper first, in isolation.
3. **`lookup_frost_dates` action** in `plant-doctor/index.ts` — schema, prompt, validation, cache read/write. Deno test with mocked Gemini.
4. **`plant_when_to_plant` action** — same pattern, depends on (3). Deno test.
5. **Service-layer methods** in `plantDoctorService.ts` — `lookupFrostDates`, `plantWhenToPlant`.
6. **`RainWaterAdvice.tsx` + Vitest** — pure component, easiest to test in isolation.
7. **`PlantingCalendarCard.tsx` + Vitest** — handles AI call, loading + error states.
8. **`TaskList compact` prop** — small conditional renders; run existing tests, nothing should regress.
9. **`LocalizedTaskCalendar.tsx` + Vitest** — composes the three cards.
10. **`App.tsx` wiring** — `/quick/calendar` route + `TAB_URL` entry.
11. **`QuickAccessHome.tsx`** — Today tile flips from placeholder to `navigate("/quick/calendar")`.
12. **Playwright spec** for the routing + AI lookup happy path (with mocked edge fn).
13. **App-reference docs** — new surface + the seven existing-doc updates.
14. **Manual test on a phone viewport** — frost lookup spinner → result, submit a plant → result, navigation back to /quick.
15. **Commit with `[skip ci]`** and `npm run deploy` when validated.

## What this wave doesn't do

- **No Quick Capture Journal** (Wave 4).
- **No new tier or beta gate** — frost lookup is rate-limited like every other AI action; AI-tier required for the planting AI helper, but the frost dates + watering advice + today's tasks all surface on all tiers (Sprout/Botanist see "Upgrade to AI for plant-specific advice" inside the planting card).
- **No changes to the full Dashboard** — `/dashboard` calendar and weather tabs unchanged.
- **No alternative frost-date sources** — we committed to AI-fetched, no static table fallback.

## Locked decisions (from master plan + open questions answered earlier)

| Question | Decision |
|---|---|
| Frost dates source | AI-fetched + cached per home (6-month TTL) |
| Card order top-to-bottom | Planting → Rain advice → Today's tasks |
| Frost lookup trigger | Automatic + silent on first /quick/calendar visit; cache after |
| TaskList compact scope | Today's pending only, with "View calendar →" link |
| Validation on AI output | Server-side hemisphere + date-range checks; refuse write on failure |
| Frost-lookup tier gate | **Open to all tiers.** Cached frost-date row is treated as a fact. Per-plant "when to plant" AI call remains Sage+ gated. |
| Rain-advice thresholds | **Per-home setting.** Stored on `home_climate` (`rain_skip_mm`, `rain_water_mm`), defaults 5mm/1mm. Edited in Climate Settings. |

## Open questions

None — both open questions have been resolved (locked in the table above).
