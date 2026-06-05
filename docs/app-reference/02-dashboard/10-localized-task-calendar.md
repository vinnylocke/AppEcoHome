# Localized Task Calendar

> The mobile home screen for "what's happening in my garden today?" Three cards stacked top-to-bottom: a frost-aware planting helper, a rain-vs-watering advice tile, and today's pending tasks. Mounted at `/quick/calendar` and reachable from the Today tile on Quick Access Home. Mobile shortcut layer — desktop users keep getting the full Dashboard.

**Route:** `/quick/calendar`
**Source files (entry points):**
- `src/components/quick/LocalizedTaskCalendar.tsx` — the screen orchestrator
- `src/components/quick/PlantingCalendarCard.tsx` — frost dates + AI helper
- `src/components/quick/RainWaterAdvice.tsx` — synthesised "skip / settled / water" advice tile

---

## Quick Summary

A phone-first composition of three small components. On mount, the screen makes one cheap Supabase parallel read (weather snapshot, home_climate row, today's open-watering count) plus one edge-fn call (`lookup_frost_dates`, cache-friendly). Total time-to-paint is dominated by the frost lookup on the first visit per home; subsequent visits within the 6-month TTL are sub-second.

The screen is **additive** — `/dashboard` and `/dashboard?view=calendar` are unchanged for power users.

---

## Role 1 — Technical Reference

### Component graph

**Wave 6 focus-mode chrome**: on mobile (`useIsMobile() === true`), the persistent top bar + side nav are hidden by App.tsx (`isFocusMode`); the `QuickAccessMenuButton` floats top-right and opens the `MobileNavDrawer` on tap. The back chrome below sits top-left and never collides with the menu button.

```
LocalizedTaskCalendar (mounted at /quick/calendar)
├── Back chrome (chevron-left "Quick" + "Today's Calendar" label)
├── PlantingCalendarCard
│   ├── Frost dates row (last frost / first frost)
│   ├── Plant input + Submit
│   └── PlantingGuidance result (when populated)
├── RainWaterAdvice
│   └── Computed verdict (skip / settled / water / info)
├── Today's tasks card
│   ├── Header: "Today's tasks" + [+ Add] button (Mobile Quick Access Wave 5)
│   └── TaskList compact (today's pending) ─ remounts via key after Add saves
└── QuickAddTaskModal (mounted on Add tap, portal)
    └── 4-field slim form (title / type / description / date)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope (anchors all reads + the Plant Doctor calls) |
| `aiEnabled` | `boolean` | App.tsx | Gates the per-plant AI helper inside PlantingCalendarCard. Frost-date lookup itself is open to all tiers. |

### State (local)

| State | Purpose |
|-------|---------|
| `rain` | `{ today: number; tomorrow: number } \| null` — forecast precipitation read from `weather_snapshots.data.daily.precipitation_sum`. |
| `openWateringTaskCount` | Number of today's `Pending` watering tasks for the home. |
| `thresholds` | User-configured `rain_skip_mm` / `rain_water_mm` (defaults 5 / 1 when no `home_climate` row exists). |
| `loading` | Truthy until the parallel reads resolve. |
| `tasksRefreshKey` | Counter passed as `key` to `<TaskList />`. Incremented after a Quick Add save to force remount + re-fetch + recompute of the rain advice (whose `openWateringTaskCount` depends on the same query). |
| `quickAddOpen` | Drives the `QuickAddTaskModal` mount. |
| `canCreateHomeTask` | Derived from `usePermissions().can("tasks.create_home")`. Disables the Add button when the caller lacks the permission. |

### Data flow — read paths

On mount, parallel reads via `Promise.all`:

```ts
supabase.from("weather_snapshots")
  .select("data").eq("home_id", homeId).maybeSingle();
// → data.daily.precipitation_sum[0..1]

supabase.from("home_climate")
  .select("rain_skip_mm, rain_water_mm").eq("home_id", homeId).maybeSingle();
// → user-edited thresholds (or null → defaults)

supabase.from("tasks")
  .select("id", { count: "exact", head: true })
  .eq("home_id", homeId).eq("type", "Watering")
  .eq("status", "Pending").eq("due_date", todayIso);
// → integer count
```

Plus the edge fn call (made by `PlantingCalendarCard` on its own mount):

```ts
PlantDoctorService.lookupFrostDates(homeId)
// → cached frost dates (free hit) OR fresh Gemini call → cache + return
```

### Data flow — write paths

The screen itself writes nothing. The two writes that the user can trigger from here are:
1. **`plant_when_to_plant`** edge fn call (Sage+) — does NOT write to the DB; pure read of cached frost dates + Gemini.
2. **Tasks** — completion / postpone / etc. routes through `TaskList` (the compact variant uses the same write paths as the full TaskList).

### Edge functions invoked

| Function | Action | When |
|----------|--------|------|
| `plant-doctor` | `lookup_frost_dates` | On `PlantingCalendarCard` mount. Reads `home_climate`; refreshes via Gemini if missing or > 180 days old. **Open to all tiers.** |
| `plant-doctor` | `plant_when_to_plant` | On Submit in the planting input. Sage+ only. Uses cached frost dates as context. |

See [Plant Doctor](../05-tools/02-plant-doctor.md) and [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md).

### Cron / scheduled jobs that affect this surface

None directly. `sync-weather` (hourly) refreshes the `weather_snapshots` row this screen reads from. `analyse-weather` updates `weather_alerts` (not read by this screen).

### Realtime channels

None. The screen reads once on mount; users navigate away and back to get fresh data.

### Tier gating

| Tier | Frost dates | Per-plant AI | Rain advice | Today's tasks |
|------|-------------|--------------|-------------|----------------|
| Sprout / Botanist | ✅ visible | 🔒 upgrade prompt | ✅ | ✅ |
| Sage / Evergreen | ✅ | ✅ | ✅ | ✅ |

Frost-date lookup is deliberately open to all tiers — the cached row is treated as a fact, not a generation. The per-plant AI helper inside the planting card is the only Sage+ gate on this screen.

### Beta gating

None.

### Permissions

None directly. Underlying `TaskList compact` enforces the standard task permissions (`tasks.create_personal`, `tasks.update`, etc.).

### Error states

| State | Result |
|-------|--------|
| Frost lookup fails or returns 422 (validation refused) | Card shows an amber "Frost dates unavailable" banner; the rest of the screen continues to work. |
| Supabase weather read returns null | Rain advice is hidden (loading state stays). |
| Per-plant AI call fails | Toast with the error message. |
| Non-AI tier submits plant name | Toast: "Upgrade to AI tier to use the planting helper." |

### Performance

- All three Supabase reads happen in parallel.
- Edge-fn call to `lookup_frost_dates` is cache-friendly: 1 AI call per home per 6 months, free reads in between.
- The screen is lazy-loaded via `lazy(() => import(...))` in `App.tsx`.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You're outside, standing in the garden, holding your phone. You want three things you'd otherwise have to dig for: *what should I do today, do I actually need to water given the forecast, and what's still time to plant?* The Localized Task Calendar gives you all three in a single scroll — no menu hunting, no nested tabs.

For a beginner, it answers the "do I water?" question that gardening apps never quite answer well, because it actually checks the rain forecast against your scheduled watering tasks. For an expert, it's a quick second-opinion calendar — *can I plant garlic now or have I missed the window?* — without having to remember last frost date by heart.

### Every flow on this screen

#### 1. Plant something (top card)

- **What you see**: a green card with your home's last frost date, first frost date, a text input, and a Submit button.
- **What you do**: type a plant name (any common name — "tomato", "garlic", "borlotti bean") and hit Submit.
- **What happens next**: an AI call produces structured guidance — earliest + latest safe outdoor dates, whether to start indoors first, spacing, depth, sun, and 2–4 tips tailored to your climate. The card expands to show the result.
- **Why a gardener cares**: the per-plant timing question is the single most common question that requires local knowledge. Anchored to your home's frost dates, the answer is actually correct for *you*.

#### 2. Rain & watering advice (middle tile)

- **What you see**: a single tile with a verdict pill and a one-line body.
- **What you do**: read it.
- **What happens next**: nothing — it's an info surface. But it tells you whether your existing watering tasks for today need attention.
- **Why a gardener cares**: a 1-second answer to "do I water today?" In summer, the answer's usually yes; in spring, it depends on the forecast. The four advice variants are:
  - **Skip watering today** — heavy rain expected (above your skip threshold) AND you have open watering tasks.
  - **Rain's got it covered** — heavy rain expected, no watering scheduled. Just informational.
  - **Water today** — almost no rain in the forecast AND you have open watering tasks.
  - **N mm forecast** — middling rain with no urgent action either way.

#### 3. Today's tasks (bottom)

- **What you see**: a slim list of today's pending tasks — title + icon + checkbox. A **+ Add** button sits at the top right of the card.
- **What you do**: tap to complete, tap "View calendar →" to drop into the full calendar, or tap **+ Add** to open the [Quick Add Task Modal](../08-modals-and-overlays/35-quick-add-task-modal.md).
- **What happens next**: completions go through the same write path as the full TaskList (materialise from ghost, write to `tasks`, broadcast over realtime). A Quick Add save inserts a one-off `tasks` row with `home_id` set, then the list remounts via a `key`-prop counter and the new task appears immediately.
- **Why a gardener cares**: you wanted *today's* tasks, not a week-view. This is the minimum surface that still keeps you in the rhythm — and Quick Add lets you log new things as you spot them without breaking flow.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| **Last frost** | Average date of the last spring frost for your location, sourced from an AI lookup and cached on your home for 6 months. Plant tender crops outdoors *after* this date. |
| **First frost** | Average date of the first autumn frost. Frost-tender crops should be harvested or covered before this date. |
| **Earliest outdoor date** (in result) | Calendar-accurate date when it's safe to plant this specific crop outdoors. |
| **Latest outdoor date** (in result) | The latest sensible date — beyond this, the growing season is too short for this crop. |
| **Indoor start date** (when shown) | When to start seeds inside if the crop needs a head start. |
| **Spacing / Depth** | Standard sowing / transplanting numbers. |
| **Skip threshold (rain)** | If forecast 48h rain ≥ this many mm and you have open watering tasks → the tile says "skip watering". Editable in Climate Settings; defaults to 5 mm. |
| **Water threshold (rain)** | If forecast 48h rain < this many mm and you have open watering tasks → the tile says "water today". Editable in Climate Settings; defaults to 1 mm. |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | All cards visible. Frost dates load normally. Submit on the planting input shows a toast: "Upgrade to AI tier to use the planting helper." Italic helper text under the input explains this. |
| Sage / Evergreen | Full functionality. |

### New user vs returning user vs power user

- **Brand new user (first visit per home)**: planting card shows a brief "Looking up your frost dates…" spinner (single Gemini call), then renders the dates. Rain advice shows whichever variant matches the moment.
- **Returning user (cache hit)**: planting card renders instantly with the cached frost dates. Submit a plant name for AI-anchored advice.
- **Power user**: probably opens this for the rain-advice synthesis or to check an unusual planting window. "View calendar →" link at the bottom hops them into the full week-view.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Treating frost dates as exact**: they're climatological averages. A late frost can still hurt tender plants — cover or watch the forecast.
- **Setting rain thresholds too aggressively**: the defaults (5 mm skip, 1 mm water) come from the established waterlog/dryness weather rules. Lower the skip threshold only if your soil drains very slowly.
- **Expecting the per-plant AI to know about every cultivar**: it knows common cultivars well, niche cultivars less so. The guidance is anchored to the species-level needs; cultivar-specific quirks can drift.
- **Missing the calendar's "View calendar →" link**: it sits at the bottom of the tasks card. Use it when you want the full week.

### Recommended workflows

- **"Should I plant this today?"**: open Quick Access → Today tile → type the plant → read the verdict. Two taps total.
- **"Do I water today?"**: open Today, scan the middle tile, done.
- **"Customise my rain advice"**: go to Account → Home Management → Climate Settings tab → Rain advice thresholds section. Save once; the calendar uses your numbers from then on.

### What to do if something looks wrong

- **"Frost dates unavailable" amber banner**: the AI returned data that failed server-side validation (e.g. impossible date for the hemisphere). The cache stays untouched; next visit triggers a fresh attempt. The rest of the screen still works.
- **Rain advice shows "0 mm forecast" but it's clearly going to rain**: the weather snapshot may be stale. `sync-weather` cron runs hourly; manually refresh from the full Dashboard's weather tab to force an update.
- **"Coming soon" message instead of the calendar**: not applicable — Wave 3 makes this surface live.

---

## Related reference files

- [Quick Access Home](./09-quick-access-home.md) — parent screen; the Today tile lives here
- [Quick Add Task Modal](../08-modals-and-overlays/35-quick-add-task-modal.md) — the slim modal the + Add button mounts
- [Add Task / Edit Schedule Modal](../08-modals-and-overlays/01-add-task-modal.md) — the full sibling for recurring schedules + area/plant binding
- [Plant Doctor](../05-tools/02-plant-doctor.md) — owner of the `lookup_frost_dates` + `plant_when_to_plant` actions
- [Weather Tab](./04-weather-tab.md) — full-Dashboard weather; shares the same `weather_snapshots` row
- [Calendar Tab](./03-calendar-tab.md) — the "View calendar →" link's destination
- [Home Climate Settings Tab](../07-management/04-climate-settings.md) — where users edit the rain thresholds
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md) — `weather_snapshots` shape
- [Seasonality (cross-cutting)](../99-cross-cutting/29-seasonality.md) — hemisphere derivation used in the frost-date prompt

## Code references for ongoing maintenance

- `src/components/quick/LocalizedTaskCalendar.tsx` — screen orchestrator
- `src/components/quick/PlantingCalendarCard.tsx` — frost dates + AI helper
- `src/components/quick/RainWaterAdvice.tsx` — synthesised advice tile (pure `computeRainAdvice` helper exported for tests)
- `src/components/TaskList.tsx` — accepts `compact?: boolean` for the slim variant
- `src/services/plantDoctorService.ts` — `lookupFrostDates` + `plantWhenToPlant` typed methods
- `supabase/functions/plant-doctor/index.ts` — `lookup_frost_dates` + `plant_when_to_plant` action handlers
- `supabase/functions/_shared/frostValidation.ts` — server-side guard against Gemini hallucinations
- `supabase/migrations/20260623000000_home_climate.sql` — table + RLS
- `src/components/HomeManagement.tsx` — Climate Settings tab Rain-advice section
- `tests/unit/components/RainWaterAdvice.test.ts` — pure helper + render tests
- `tests/unit/components/PlantingCalendarCard.test.ts` — loading + error + submit flows
- `tests/unit/components/LocalizedTaskCalendar.test.ts` — composition + back navigation
- `tests/e2e/specs/quick-calendar.spec.ts` — routing + AI lookup happy path
