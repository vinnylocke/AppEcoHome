# Home (Main Dashboard)

> The new default landing view of the Dashboard tab — "how is my garden doing right now?" answered on one screen: a status strip, a location-by-location garden overview grid, quick actions, and today's tasks.

**Route / how to reach it:** `/dashboard` (no `?view=` param, explicit `?view=home`, legacy `?view=dashboard`, or any unknown value). Labelled **"Dashboard"** in the sub-tab switcher; the previous dashboard page lives on unchanged as the sibling **"Overview"** tab (`?view=overview`).
**Source files (entry points):**
- `src/components/home/HomeMain.tsx` — the page (lazy-loaded from App.tsx)
- `src/components/home/HomeStatusStrip.tsx` — greeting + signal chips
- `src/components/home/AttentionRow.tsx` — ranked "needs attention" cards (Phase 2)
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the centrepiece grid (AreaRow carries the Phase 2 sensor/valve/tasks chips)
- `src/components/home/WeekPulse.tsx` — detailed-mode 7-day dot strip + harvest/yield line (Phase 3)
- `src/components/home/QuickActionsRow.tsx` — launcher-pin tiles
- `src/hooks/useHomeOverview.ts` — the `home-overview` edge-function fetch (Phase 2)
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — the telemetry aggregate
- `src/App.tsx` — view-param parsing (~line 505), localStorage persistence (~line 514), switcher + render branch (~line 1530–1600)

---

## Quick Summary

Phases 1–3 of the new-home-dashboard plan (`docs/plans/new-home-dashboard.md`) — all shipped 2026-07-02. One shared page rendered in two densities — **simple** (guidance-first, the default) and **detailed** (telemetry-first, the default for `persona === "experienced"`) — composed of a slim status strip, a ranked "needs attention" row (hidden when calm), one LocationOverviewCard per location with one AreaRow per area (plants + Phase 2 soil-sensor / valve / per-area task chips), a persona-tuned quick-actions row reusing the `/quick` launcher pins, a compact today's-tasks list, the detailed-mode-only WeekPulse (7-day dot strip + harvest/yield line), and (simple mode only) the Seasonal Picks card. The grid renders instantly from client-held state; the **`home-overview`** edge function layers live telemetry on top and soft-fails — the page never blocks on it. **Deviation from the plan:** the sun-hours chip was dropped — no per-area sun columns exist in the schema (sun analysis is computed client-side from shapes/lux).

---

## Role 1 — Technical Reference

### Component graph

- `src/App.tsx` — `/dashboard` route; renders the five-tab switcher (`data-testid="dashboard-view-switcher"`), the shared onboarding cards, and the `home`/`overview` branch
  - `GettingStartedChecklist` (`src/components/GettingStartedChecklist.tsx`) — **shared by Home + Overview** (hoisted above the branch split)
  - `NotificationOptInCard` (`src/components/NotificationOptInCard.tsx`) — shared by Home + Overview
  - `InstallPwaPrompt` (`src/components/InstallPwaPrompt.tsx`) — shared by Home + Overview
  - `HomeMain` (`src/components/home/HomeMain.tsx`) — the page, inside `Suspense` (lazy chunk); calls `useHomeOverview(homeId)` and builds a `telemetryByArea` map (area id → `OverviewArea`) memoised from the response
    - `HomeStatusStrip` (`src/components/home/HomeStatusStrip.tsx`) — greeting + weather / **"X of Y done today"** headline + breakdown chips (to-do / skipped / postponed) / overdue / frost chips (RHO-20). The breakdown is built by `buildTodaySummary` (`src/lib/todaySummary.ts`): **pending** comes from the ghost-aware client `locationTaskCounts` sum, while **done / skipped / postponed** come from the server `dayStrip` today bucket (`useHomeDashboardStats`, mounted in HomeMain for **both** densities). Zero-count chips are hidden.
    - Density toggle (`home-density-toggle`, inline in HomeMain) — Simple / Detailed icon pair
    - `AttentionRow` (`src/components/home/AttentionRow.tsx`) — max-4 ranked "needs attention" cards from `home-overview`; renders `null` when the list is empty (calm garden); each card is kind-coloured + icon-matched and deep-links via its `route`
    - `GardenOverviewGrid` (`src/components/home/GardenOverviewGrid.tsx`) — 1→2 column responsive grid, only when ≥ 1 location; threads `telemetryByArea` down
      - `LocationOverviewCard` (`src/components/home/LocationOverviewCard.tsx`) — one per location; passes each area's telemetry to its row
        - `AreaRow` (`src/components/home/AreaRow.tsx`) — one per area, plus a synthetic "Not in an area yet" row for unassigned plants. Hosts the Phase 2 chips (all optional, driven by the `telemetry` prop): `SensorChip` (soil moisture band / % + temp + low-battery icon; grey when stale), `ValveChip` (Watering countdown / failed / detailed-mode next-run), and a per-area tasks chip (`home-area-tasks-chip`)
    - Empty-garden setup card (`home-empty-garden`, inline in HomeMain) — 3 CTAs when the home has no locations
    - `QuickActionsRow` (`src/components/home/QuickActionsRow.tsx`) — up to 6 `QuickTile`s (`src/components/quick/QuickTile.tsx`, `layout="compact"`) + Customise link. The `/walk` tile launches with `state:{ from: "/dashboard" }` so the Garden Walk returns to the dashboard on finish (re-firing `fetchDashboardData` so the "done today" count refreshes) instead of the `/quick` fallback (RHO-20).
    - `TaskList` (`src/components/TaskList.tsx`) — existing component with the `compact` prop, `targetDate` = today
    - `WeekPulse` (`src/components/home/WeekPulse.tsx`) — **detailed mode only** (conditionally mounted, so simple mode never pays its fetch); compact 7-day dot strip + harvests-due/yield line reusing `useHomeDashboardStats`; the whole card taps through to `?view=overview`
    - `SeasonalPicksCard` (`src/components/seasonal/SeasonalPicksCard.tsx`, `variant="dashboard"`) — **simple mode only**

The quiz-prompt card, `DailyBriefCard`, `HeadGardenerCard`, `AssistantCard` and `HomeDashboard` render **only on the Overview branch** — see [Dashboard Tab (Overview)](./01-dashboard-tab.md).

### Props received

`HomeMain` (all passed from App.tsx state):

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` | Scopes TaskList + SeasonalPicksCard |
| `userId` | `string \| null` | `session.user.id` | Passed to `useQuickLauncherPins` for remote pin revalidation |
| `firstName` | `string \| null` | `profile.first_name` | Greeting |
| `weather` | `any` | App's extracted current weather (`{ temp, description, Icon }`) | Weather chip |
| `rawWeather` | `any` | Latest `weather_snapshots.data` JSONB | Frost-tonight derivation |
| `locations` | `OverviewLocation[]` | App's `locations` state (homes query) | The grid |
| `locationTaskCounts` | `Record<string, number>` | App's per-location today counts | Per-card task chip + summed for the strip |
| `overdueTaskCount` | `number` | App's home-scoped overdue count (RHO-3) | Overdue chip |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | SeasonalPicksCard AI branch |
| `isPremium` | `boolean` | `profile.enable_perenual` | SeasonalPicksCard |
| `availabilityCtx` | `QuickLauncherAvailabilityCtx` | Built inline in App.tsx (`subscriptionTier`, `aiEnabled`, `isBeta`, `homeId`) | Filters launcher tiles via `resolvePins` |

### State (local)

- `storedDensity` (`useState`, init-only) — synchronous read of localStorage `rhozly:home:density` at mount.
- `densityOverride` (`"simple" | "detailed" | null`) — the user's explicit choice; seeded from `storedDensity` when valid. Written by the density toggle buttons; when `null` the effective density follows the persona (`persona === "experienced"` → `"detailed"`, everything else — including `null` while `usePersona()` is still loading — → `"simple"`).
- The density is **persisted only on user toggle** (`setDensity` writes localStorage) — never on first render, so the persona default isn't frozen before `usePersona()` resolves (the Garden Snapshot preference lesson).
- `usePersona()` (module-cached read of `user_profiles.persona`) drives both the density default and the quick-action defaults.

### Data flow — read paths

The Phase 1 grid renders from data App.tsx already holds; Phase 2/3 add exactly two reads of their own:

- **`useHomeOverview(homeId)`** (`src/hooks/useHomeOverview.ts`) — one `supabase.functions.invoke("home-overview", { body: { homeId, today } })` call on mount / home switch, `today` being the **client-local** date (`getLocalDateString`). Generation-guarded (an `activeHomeRef` drops stale responses after a home switch) and cleared to `null` when `homeId` changes. **Soft-fails:** on any error it logs and leaves `overview` null — the grid still renders without telemetry chips and the attention row stays hidden. Returns `{ locations[], attention[] }`; HomeMain flattens `locations[].areas[]` into the `telemetryByArea` map.
- **`useHomeDashboardStats(homeId)`** — mounted **only in detailed mode** via `WeekPulse`, reusing the same `home-dashboard-stats` aggregate the Overview tab renders in full (`dayStrip`, `garden.harvestBlueprintsDue`, `garden.totalYieldByUnit`).

Everything else is the Phase 1 client-held state:

- **Homes query (App.tsx `fetchDashboardData`, ~line 705):** `supabase.from("homes").select("*, weather_snapshots(data, updated_at), locations(*, areas(id, name), inventory_items(id, status, area_id, growth_state, plant_name))")`. The nested `inventory_items` select was **widened for this feature** to include `area_id`, `growth_state`, `plant_name` — the grid groups plants by area client-side (`LocationOverviewCard` builds a `plantsByArea` map; items whose `area_id` is null or points at a deleted area fall into the "Not in an area yet" row). Fires on mount, pull-to-refresh, realtime events, revisit. RLS: standard home-membership policies on `homes`/`locations`/`inventory_items`. Caching: the existing dashboard sessionStorage/localStorage snapshot pattern — see [Caching](../99-cross-cutting/14-caching.md).
- **Inventory realtime refetch (App.tsx `handleInventoryRealtime`, ~line 1062):** `supabase.from("inventory_items").select("id, status, location_id, area_id, growth_state, plant_name").eq("home_id", homeId).limit(500)` — the same three columns were added here so a realtime-driven refresh doesn't strip the grid's grouping data.
- **`useQuickLauncherPins(userId)`** — synchronous localStorage read (`rhozly_quick_launcher_v1`) + background revalidate against `user_profiles.quick_launcher_pins`. See [Quick Access Home](./09-quick-access-home.md).
- **`usePersona()`** — one `user_profiles.select("persona").eq("uid", uid)` read, module-cached.
- **`TaskList`** (compact) and **`SeasonalPicksCard`** make their own reads exactly as documented on their own surfaces — unchanged by this page.

### Data flow — write paths

- **Density toggle** → localStorage `rhozly:home:density` only. No DB write, no offline queue, no error path beyond a swallowed try/catch.
- Everything else on the page is navigation or delegated to child components (TaskList completion writes are TaskList's own, documented in [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md)).
- **View persistence (App.tsx):** visiting `/dashboard` with an explicit `?view=` writes the *resolved* view to localStorage `rhozly_dashboard_view` (legacy `dashboard` persists as `home`). A stored legacy `"dashboard"` value is deliberately **not restored** — it falls through to the new `home` default once at release; the user's next explicit choice is respected from then on.

### Edge functions invoked

- **`home-overview`** (`supabase/functions/home-overview/index.ts`) — the Phase 2 one-call aggregate for the grid chips + attention row. `requireAuth` (user JWT) + an explicit `home_members` membership check (403 `not_a_member` otherwise); body `{ homeId, today }` where `today` is the client-local date. Runs **home-bounded parallel reads** (no fleet scans): `locations` + nested `areas`; `inventory_items` grouped per area into `{ total, byGrowthState, unplanted }`; active `devices`; the `latest_device_readings(p_home_id)` RPC + `devices.battery_percent`; open Pending `tasks` widened to `due_date ≤ today+3` OR `window_end_date ≥ today` (so closing harvest windows are visible); active `weather_alerts` (max 5); failed `automation_runs` in the last 24 h (max 5); and — only when the home has valves — `valve_events` (last 200) + `automation_valve_queue` pending/failed rows for those valves. Task splits are snooze-aware (`next_check_at` in the future excludes a task from due/overdue) and harvest-window-aware. Returns `{ locations[] (each area with plants/sensor/valve/tasksToday), attention[] }`. Pure logic lives in `_shared/homeOverview.ts` and is Deno-tested (`supabase/tests/homeOverview.test.ts`, HOME-OV-001..010):
  - `deriveValveState` — "running" only while inside the newest `turn_on`'s `duration_seconds` countdown AND no newer `turn_off` exists (never claims running past the countdown); a **failed** queue row newer than the last event → `failed`; `nextRunAt` = earliest pending `turn_on` in the queue.
  - `soilBand` — moisture `< 30` = dry, `> 70` = wet, otherwise ok (the same capacitive-sensor bands the automation templates use).
  - `rankAttention` — overdue tasks → weather alert → failed automation → low battery (< 25 %) → dry soil (fresh readings only, ≤ 24 h) → closing harvest window; capped at `MAX_ATTENTION_ITEMS` = 4.
  - `summariseSoilReading` — null-safe per-field extraction (`soil_moisture` / `soil_temp` / `soil_ec`), battery falls back from the device column to the reading payload, computes `readingAgeMin`.
- **`home-dashboard-stats`** — indirectly, via `WeekPulse` → `useHomeDashboardStats` (detailed mode only). Documented on the [Dashboard Tab (Overview)](./01-dashboard-tab.md).

See the [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) for the one-line registry entry.

### Cron / scheduled jobs that affect this surface

Same set as the Overview tab, because they feed the shared App.tsx state this page renders:

| Cron | What shows up here |
|------|--------------------|
| `sync-weather` (hourly) | Weather chip + frost-tonight chip (`weather_snapshots`) |
| `generate-tasks` (daily) | Today's task counts (strip chip, per-location chips, compact TaskList) |
| `update-plant-states` (daily) | `inventory_items.growth_state` — the colour of the area-row dots |
| `run-automations` (5 min) | May complete tasks; counts refresh via realtime. Also fires valves → `valve_events` / `automation_valve_queue`, which drive the ValveChip state on the next `home-overview` fetch |
| `integrations-ewelink-sync` (periodic) | Refreshes `device_readings` — the freshness (and stale-grey state) of the SensorChip |

### Realtime channels

No subscriptions of its own — it **inherits App.tsx's home realtime wiring** (`DashboardRealtimeSubscriber`): `home_id`-filtered `postgres_changes` on `locations` / `areas` → full dashboard refetch; `inventory_items` → the lightweight `handleInventoryRealtime` path (which now carries `area_id` / `growth_state` / `plant_name`, keeping the grid live); `tasks` → refetch of the task counts.

### Tier gating

- **The grid, status strip, quick actions and task list have no tier gate** — identical for Sprout / Botanist / Sage / Evergreen.
- `SeasonalPicksCard` keeps its own existing gating (AI-personalised picks for Sage+, deterministic fallback below) — unchanged, see [Seasonal Picks Card](./14-seasonal-picks.md).
- Launcher tiles are filtered by each catalogue entry's `isAvailable(ctx)` predicate (tier / AI / beta), same as `/quick`.
- The AI cards (`HeadGardenerCard`, `AssistantCard`) do **not** render here — they stay on Overview with their existing gates.

### Beta gating

None.

### Permissions / role-based UI

None on this surface itself. Child flows enforce their own keys (TaskList completion, and the drill-in LocationPage's area/plant actions).

### Error states

| State | What happens |
|-------|--------------|
| Dashboard fetch failed | The page renders whatever cached state exists; the strip's task chips show cached counts. (The explicit "Could not load dashboard data" retry card lives on the Locations sub-tab.) |
| `home-overview` call failed | **Soft-fail by design** — the hook logs to console and leaves `overview` null; the grid renders from client-side data without sensor/valve/tasks chips and the attention row stays hidden. No error UI, no retry prompt. |
| Sensor reading older than 24 h | The SensorChip greys out (number still shown in detailed mode) rather than presenting a stale value as current; tooltip says "Last reading over a day old". |
| Valve command failed | The ValveChip shows red "⚠ Valve failed" (a failed `automation_valve_queue` row newer than the last `valve_event`), and an `automation_failed` attention card may also surface. |
| No weather yet | Weather chip and frost chip simply don't render (`weather` null / no matching daily entry). |
| No locations | The 3-CTA setup card (`home-empty-garden`) replaces the grid: Create a location → `/management?open=add-location`, Add your first plant → `/shed?open=add-plant`, Take the garden quiz → `/profile`. |
| Location with no areas | Inline "+ Add an area to start tracking plants here" CTA (navigates to the LocationPage drill-in). |
| Area with no plants | "No plants yet" label on the row. |
| localStorage unavailable (private mode) | Density falls back to persona default each visit; try/catch swallows the write. |

### Performance notes

- `HomeMain` is `lazy()`-loaded (App.tsx line ~90) and wrapped in `Suspense` — it doesn't bloat the Overview chunk.
- First paint of the grid is pure render over already-fetched state; telemetry arrives afterwards from the single `home-overview` call (one round trip for the whole estate — no per-area queries) and hydrates the chips in place.
- The edge function's valve reads are gated behind "does this home have valves at all", and every query is bounded to the home (`valve_events` capped at 200, alerts/failed-runs at 5).
- `WeekPulse` is conditionally mounted, so simple mode never pays the `home-dashboard-stats` fetch.
- Growth-state dots are capped at 5 per row with a `+N` overflow so a 40-plant bed doesn't render 40 DOM nodes.
- `usePersona` is module-cached — one profile read per session across all consumers.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the front door now. Where the old dashboard (still one tab over, as **Overview**) tells you the story of your week — stats, briefs, AI insights — the Home view answers the faster, more physical question: *how is my garden doing right now, and what needs me today?* You open the app, and in one glance you get the weather, the day's workload, anything overdue, a frost warning if one's coming, and a card for every location showing every area and the state of every plant in it.

For Sarah, the newer gardener, the win is calm: a friendly greeting, a small set of chips instead of a wall of stats, coloured dots that say "your plants are at these stages" without demanding you interpret numbers, and quick actions biased towards learning — identify a plant, see today's tasks, snap a photo, open your plants. If she hasn't set anything up yet, the page becomes a three-step setup card rather than an empty void.

For Marcus, the experienced gardener, flip the toggle to Detailed (or let it default there once your persona says "experienced") and each area row adds a written growth-state breakdown — "3 flowering · 2 seedling · 1 unplanted" — so a whole estate reads like a stock sheet. His quick actions default to the operating set: garden walk, today, journal, light sensor. And if he has hardware connected, the same rows now carry **live telemetry**: soil moisture and temperature from each area's sensor, the watering valve's state (running with a countdown, next scheduled run, or a failure flag), and a per-area task chip. Above the grid, a "Needs attention" row surfaces the day's real problems — ranked, capped at four, and invisible when the garden is calm. Detailed mode also gets the **week pulse**: a compact seven-day dot strip plus a harvests-due/yield line, so the week's shape is visible without leaving Home.

Nothing was taken away: the entire previous dashboard is intact under **Overview**, one tap to the right.

### Every flow on this page

#### 1. Status strip (top)

1. **What you see:** "Good morning, Vinny" plus up to four pill chips — current weather (icon + temp + description), "4 tasks today", a red "1 overdue" (only when > 0), and a blue "Frost tonight 1°" (only when tonight's minimum is ≤ 3 °C).
2. **Action:** tap any chip.
3. **What happens:** weather and frost chips open the Weather sub-tab; the tasks and overdue chips open the Calendar sub-tab.
4. **Why a gardener cares:** the whole day's triage in one line — is today a doing day, and is anything at risk tonight?
5. **Beginner framing:** read it like a garden weather forecast. **Expert framing:** it's the same signals as the Overview's Daily Brief hero, compressed to a single row so the grid gets the screen.

#### 2. Simple / Detailed toggle (top-right)

1. **What you see:** two small icon buttons (list = Simple, rows = Detailed).
2. **Action:** tap either.
3. **What happens:** area rows gain/lose the growth-state breakdown text; Seasonal Picks appears only in Simple. Your choice is remembered on this device.
4. **Why a gardener cares:** density on your terms. Until you ever touch it, the page follows your quiz persona — experienced gardeners start Detailed, everyone else Simple.

#### 2b. Needs attention row (both modes; hidden when calm)

1. **What you see:** up to four small coloured cards under "Needs attention", most urgent first: red = overdue tasks, sky-blue = an active weather alert, amber = an automation that failed in the last 24 hours, orange = a device battery under 25%, yellow = an area whose soil sensor reads dry, lime = a harvest window closing within 3 days. If nothing needs you, the row doesn't render at all.
2. **Action:** tap a card.
3. **What happens:** it deep-links to the right place — overdue/harvest → Calendar, weather → Weather tab, automation/battery → Integrations, dry soil → Locations.
4. **Why a gardener cares:** it's the triage list. A beginner typically sees zero or one card (calm by design); a pro with sensors, valves and a heavy schedule sees their genuine problem list without hunting for it.
5. **Beginner framing:** an empty row is good news. **Expert framing:** the ranking is deliberate (overdue → weather → failed automation → battery → dry soil → closing harvest) and capped at four, so it never becomes a wall of noise.

#### 3. Garden Overview grid — one card per location

1. **What you see:** under "Your garden", a card per location: an indoors/outdoors icon, the name, "Outdoors · 3 areas · 12 plants", a green tasks-today chip when that location has work due, an amber hazard banner if the location has one recorded, then one row per area.
2. **Action:** tap the card header or any area row.
3. **What happens:** both navigate to the existing Location drill-in (`/dashboard?locationId=…`), where area details open.
4. **Why a gardener cares:** every bed, border, greenhouse shelf and windowsill on one screen — the "walk the garden without boots" view.
5. **Beginner framing:** each dot is a plant; the colour is its life stage. **Expert framing:** the row is a per-area status line; Detailed mode adds the exact stage census.

#### 4. Area rows and the plant dots

Each row shows the area name, up to **5 coloured dots** (one per plant, `+N` when there are more), and the plant count. Hover/long-press a dot for the plant's name and stage. Unassigned plants collect in a **"Not in an area yet"** row — a gentle prompt to file them. An empty location shows "+ Add an area to start tracking plants here"; an empty area says "No plants yet".

#### 4b. Telemetry chips on area rows (when hardware is connected)

Areas with a linked soil sensor or water valve gain small chips under the area name. They come from a single live snapshot fetched when the page opens; if that fetch fails, the grid simply shows without them — nothing blocks.

- **Soil chip.** In Simple mode it speaks plainly: **"Soil: OK"**, **"Soil: Dry"** (moisture below 30%), or **"Soil: Wet"** (above 70%) — green, yellow and blue respectively. In Detailed mode it shows the actual moisture % plus the soil temperature, and a small orange battery icon appears when the sensor's battery is under 25%. **The stale-grey rule:** if the last reading is more than 24 hours old, the chip turns grey — an old number presented as current is worse than no number, so grey means "don't trust this yet; check the sensor".
- **Valve chip.** A pulsing blue **"Watering"** (Detailed: "Watering · N min left") while a run is genuinely in progress — the app only claims "running" while the valve's own countdown is live, never past it. A red **"⚠ Valve failed"** means the most recent watering command didn't reach the device — that zone may not have watered, so check it. Detailed mode also shows a quiet **"Next water HH:MM"** chip when a run is queued.
- **Tasks chip.** A small green chip when the area has tasks due today — Detailed mode shows the count.

#### 4c. Week pulse (Detailed mode only)

Under today's tasks, a one-card seven-day strip: each day shows a letter, up to three dots (red = overdue, amber = pending, green = done) and the day's task total, with today highlighted. Below it, a harvest line — "2 harvests due · picked 3.5 kg" — when there's harvesting on. Tap anywhere on the card to open the full Overview tab. Simple mode never loads it, keeping the beginner page light.

#### 5. Quick actions

1. **What you see:** up to 6 tiles. If you've ever customised your Quick Launcher (on `/quick` or in Account Settings), **your saved pins render here** — same set, same order. If you never have, the defaults are persona-aware: new/unknown gardeners get Plant Lens / Today / Capture / Plants; experienced gardeners get Walk / Today / Journal / Light Sensor.
2. **Action:** tap a tile, or "Customise".
3. **What happens:** the tile navigates to its destination; Customise opens the existing picker at `/gardener?section=quick-launcher`. Changes made there apply to this row *and* to `/quick`.
4. **Why a gardener cares:** your four-to-six most-used tools, one tap from the front door — now on desktop too, not just the mobile `/quick` screen.

#### 6. Today's tasks

A compact list of today's tasks (the same TaskList engine as everywhere else — complete, postpone, open detail all work). "See all →" opens the full Calendar sub-tab.

#### 7. Seasonal Picks (Simple mode only)

The weekly "what can I grow right now?" card, exactly as on Overview. Detailed mode hides it to keep the page telemetry-first.

#### 8. First-run cards

The Getting Started checklist, notification opt-in, and PWA install prompt appear above the page for eligible users — and they appear on Overview too, so new gardeners see them wherever they land.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "Good morning / afternoon / evening, [name]" | Time-of-day greeting (before 12:00 / before 18:00 / after) |
| Weather chip | Current temp (rounded) + condition from the latest weather snapshot |
| "X of Y done today" headline | X = tasks done today (server `dayStrip` bucket), Y = done + remaining (ghost-aware). Moves as you complete tasks, so a static total no longer reads as "broken" (RHO-20). Reads "No tasks today" when Y = 0. |
| "N to do" chip | Remaining tasks due today (hidden when 0) |
| "N skipped" / "N postponed" chips | Today's skipped tombstones / snoozed-forward tasks (each hidden when 0) |
| Red "N overdue" chip | Pending tasks past due across the **whole home** (only when > 0) |
| Blue "Frost tonight N°" chip | Tonight's forecast minimum, shown only when ≤ 3 °C |
| Indoors / Outdoors icon | Location's `is_outside` flag (tree = outdoors, house = indoors) |
| "Outdoors · N areas · N plants" | Location subtitle — environment, area count, plant count |
| Amber banner on a card | The location's recorded hazard note (e.g. "Foxes dig here") |
| Green chip with a number (card header) | Tasks due today in that location |
| Plant dot colours | Sky = Germination, lime = Seedling, green = Vegetative, amber = Budding, pink = Flowering, orange = Fruiting, yellow = Ripening, stone = Senescence, **grey = not planted yet**; unknown stages default green |
| `+N` after the dots | More plants than the 5 shown |
| "3 flowering · 2 seedling" (Detailed only) | Growth-state census of the area, most common first (`unplanted` = not yet in the ground) |
| "Not in an area yet" row | Plants assigned to the location but no area |
| "No plants yet" | Area exists but holds nothing |
| Soil chip "OK / Dry / Wet" (Simple) | Moisture band: Dry < 30%, Wet > 70%, OK between — the same bands the watering automations use |
| Soil chip "45% · 18.5°" (Detailed) | Latest sensor moisture % + soil temperature; orange battery icon = sensor battery < 25% |
| Grey soil chip | Last reading is over 24 hours old — treat the value as unknown, not current |
| "Watering · N min left" (pulsing blue) | Valve run in progress; the countdown comes from the run's own duration and never overruns it |
| "⚠ Valve failed" (red) | The most recent watering command failed to reach the device — that zone may not have watered |
| "Next water HH:MM" (Detailed) | The earliest queued watering run for this area's valve |
| Green chip on an area row | Tasks due today in that area (Detailed shows the count) |
| "Needs attention" cards | Ranked triage, max 4: overdue (red) → weather alert (blue) → failed automation (amber) → low battery (orange) → dry soil (yellow) → closing harvest (lime); hidden entirely when calm |
| Week pulse dots (Detailed) | Per day: red = overdue, amber = pending, green = done on time, grey = nothing scheduled; the number is that day's total; today is highlighted |
| "N harvests due · picked X kg" | This week's harvest workload + logged yield so far |
| Quick-action tiles | Your launcher pins (or the persona defaults) |
| "See all →" | Opens the Calendar sub-tab |

### Tier-by-tier experience

| Tier | Differences on Home |
|------|--------------------|
| Sprout | Full page. Seasonal Picks uses the deterministic (non-AI) picks. Launcher tiles gated to higher tiers are silently filtered out. |
| Botanist | Same as Sprout. |
| Sage | Seasonal Picks becomes AI-personalised. |
| Evergreen | Same as Sage. (The Evergreen-only AI cards live on Overview, not here.) |

No upgrade gates appear on the grid, strip, quick actions or task list.

### New user vs returning user vs power user

- **Brand new user** (no locations): greeting + "0 tasks today" strip, then the 3-CTA setup card — create a location, add a plant, take the quiz. The Getting Started checklist sits above.
- **Returning user:** glance the strip, scan the dots for anything unexpected, tick off today's tasks from the compact list.
- **Power user** (many locations, 50+ plants): flip to Detailed for the census lines, live sensor/valve chips and the week pulse; the 2-column grid and 5-dot cap keep even large estates on one scrollable screen.

### Beta user experience

No differences (the BetaFeedbackBanner renders app-wide above the page as usual).

### Common mistakes / pitfalls

- **"Where did my dashboard go?"** It's one tab to the right — **Overview**. Nothing was removed; the default landing view changed. Old bookmarks with `?view=dashboard` land here (Home), because "Dashboard" is now this tab's label.
- **Assuming grey dots mean unhealthy.** Grey means *not planted yet* (still in the shed/nursery), not sick. Health lives in the Watchlist and the drill-ins.
- **Expecting the dots to show all plants.** Only 5 render per row; the `+N` covers the rest — tap through for the full list.
- **Customising quick actions here and expecting a separate set on `/quick`.** They're the same pins deliberately — one customisation carries across both surfaces.
- **Toggling density and expecting it to sync across devices.** It's a per-device preference (localStorage), not a profile setting.
- **Reading a grey soil chip as a live value.** Grey means the sensor hasn't reported in over 24 hours — the number (if shown) is the *last known* reading, not now. Check the device before acting on it.
- **Panicking at a missing attention row.** No row = nothing needs attention. It's hidden when calm, not broken.
- **Expecting sensor/valve chips without hardware.** Areas without a linked device simply don't show those chips — there's no upsell and no placeholder; integrations are open to all tiers.
- **Looking for a sun-hours chip.** There isn't one — per-area sun analysis isn't persisted server-side yet, so the planned chip was deliberately dropped.

### Recommended workflows

- **Morning glance (30 s):** strip → attention row (anything ranked?) → scan the grid for a grey/dry soil chip, a failed valve, the hazard banner or a heavy task chip → tick today's tasks.
- **Estate telemetry sweep (Detailed):** flip to Detailed once — every sensor's moisture/temp, every valve's state and next run, and the week pulse read top-to-bottom like a status board.
- **Filing stray plants:** see a "Not in an area yet" row → tap it → assign plants to areas from the Location page.
- **Making the page yours:** tap the density toggle to your taste, then Customise the quick actions once — both stick.

### What to do if something looks wrong

- **Counts or dots look stale:** pull to refresh (the "Synced Xs ago" pill above the page shows staleness); realtime normally keeps the grid live within seconds of a change.
- **A plant is missing from its area's dots:** check the "Not in an area yet" row first — it probably has no `area_id`.
- **The page keeps opening in the wrong density:** you (or someone on this device) toggled it once — toggle it back; the persona default only applies while no choice is stored.
- **You land on Overview instead of Home:** you previously chose Overview and the app remembered — tap the "Dashboard" sub-tab to come back (that choice is then remembered instead).
- **Sensor/valve chips vanished:** the live-snapshot call likely failed this visit (offline, or the endpoint erred) — the page carries on without them by design. Reload; if they stay gone, check the device on the Integrations page.
- **A valve says "⚠ Valve failed":** the last watering command didn't complete. Water the zone manually if it's due, then check the automation's run history and the device's connection.
- **A soil chip is grey:** the sensor hasn't reported in over a day — check its battery/signal on the Integrations page.

---

## Related reference files

- [Dashboard Tab (Overview)](./01-dashboard-tab.md) — the previous dashboard, now the sibling `?view=overview` tab
- [Locations Tab](./02-locations-tab.md), [Calendar Tab](./03-calendar-tab.md), [Weather Tab](./04-weather-tab.md) — the other sub-tabs
- [Location Page (Drill-In)](./07-location-page.md) — where card headers and area rows land
- [Quick Access Home](./09-quick-access-home.md) — the shared launcher catalogue + pins
- [Seasonal Picks Card](./14-seasonal-picks.md) — rendered here in simple mode
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) — shared onboarding card
- [Routing](../99-cross-cutting/21-routing.md) — `?view=` params, legacy mapping, localStorage persistence
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — `inventory_items.growth_state` / `area_id`
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — the task counts
- [Data Model — Integrations](../99-cross-cutting/09-data-model-integrations.md) — `devices`, `device_readings` (+ `latest_device_readings` RPC), `valve_events`, `automation_valve_queue` feeding the sensor/valve chips
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — the `home-overview` registry entry
- [Weather](../99-cross-cutting/27-weather.md) — `weather_alerts` feeding the attention row
- [Realtime](../99-cross-cutting/15-realtime.md) — the inherited home realtime wiring
- [Onboarding State](../99-cross-cutting/30-onboarding-state.md) — persona source (quiz)

## Code references for ongoing maintenance

- `src/components/home/HomeMain.tsx` — page entry; density state, `useHomeOverview` + `telemetryByArea` threading, empty-garden card
- `src/components/home/HomeStatusStrip.tsx` — chips + frost derivation
- `src/components/home/AttentionRow.tsx` — kind → icon/colour map, deep-link routing
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the grid; AreaRow hosts `SensorChip` / `ValveChip` / the tasks chip (soil banding mirrors `_shared/homeOverview.ts`)
- `src/components/home/WeekPulse.tsx` — detailed-mode dot strip + harvest/yield line
- `src/components/home/QuickActionsRow.tsx` — pins → tiles
- `src/hooks/useHomeOverview.ts` — generation-guarded, soft-failing fetch
- `supabase/functions/home-overview/index.ts` — auth/membership + home-bounded parallel reads + payload shaping
- `supabase/functions/_shared/homeOverview.ts` — `deriveValveState`, `soilBand`, `rankAttention`, `summariseSoilReading`
- `supabase/tests/homeOverview.test.ts` — HOME-OV-001..010
- `supabase/seeds/13_integrations.sql` — seeded ecowitt integration + soil sensor (Raised Bed A) + valve (South Border)
- `src/App.tsx:503` — `DashboardView` parsing (unknown/legacy → `home`)
- `src/App.tsx:514` — `rhozly_dashboard_view` persistence + legacy-"dashboard" fall-through
- `src/App.tsx:1531` — five-tab switcher; `src/App.tsx:1561` — shared cards + home/overview branch
- `src/App.tsx:~710` / `:~1062` — homes query + inventory realtime select (`area_id, growth_state, plant_name`)
- `src/lib/quickLauncherCatalogue.ts` — `defaultQuickLauncherPins(persona)`
- `src/lib/quickLauncherPrefs.ts` — `hasStoredPins()`
- `src/hooks/usePersona.ts` — persona read
- `tests/e2e/specs/home-main.spec.ts` + `tests/e2e/pages/HomeMainPage.ts` — HOME-001..008 (HOME-008 mocks `home-overview`)
- `tests/unit/lib/quickLauncherCatalogue.test.ts` — persona-default cases
- `docs/plans/new-home-dashboard.md` — the full build plan (Phases 1–3 shipped 2026-07-02)
