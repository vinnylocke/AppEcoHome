# Home (Main Dashboard)

> The single `/dashboard` view — "how is my garden doing right now?" answered on one screen, rendered in two densities. The old sibling **"Overview"** sub-tab was merged in here (design overhaul Phase 4.2): its Daily Brief hero, full task list, and stat wall (now **Garden Snapshot**) live behind the **Detailed** density, while the Head Gardener, AI Insights, and Week Ahead cards render in **both** densities (product call 2026-07-19). **Since 2026-07-20 ("one responsive home") this is the SOLE home for BOTH phone and desktop** — the phone-only `/quick` launcher home (`QuickAccessHome`) was retired and folded in here (Simple density on phone is the fast glanceable view; its customisable launcher is the `QuickActionsRow` below — same catalogue + pins). Previously phone landed on `/quick`; now `/` redirects both platforms here.

**Route / how to reach it:** `/dashboard` (no `?view=` param, explicit `?view=home`, legacy `?view=dashboard`, legacy `?view=overview`, or any unknown value — **all** fall through to home). It is also the **`/` landing for both phone and desktop**, and the target of the legacy `/quick` redirect. Labelled **"Dashboard"** in the four-tab sub-tab switcher (Dashboard / Locations / Calendar / Weather). The Overview tab no longer exists — see [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md).
**Source files (entry points):**
- `src/components/home/HomeMain.tsx` — the page (lazy-loaded from App.tsx); owns density state and the single `useHomeDashboardStats` mount
- `src/components/home/HomeStatusStrip.tsx` — Simple-density hero (greeting + signal chips)
- `src/components/DailyBriefCard.tsx` — Detailed-density hero (the old Overview hero)
- `src/components/home/GardenSnapshot.tsx` — the old Overview stat wall, relocated (Detailed only)
- `src/components/home/AttentionRow.tsx` — ranked "needs attention" cards
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the centrepiece grid (AreaRow carries the sensor/valve/tasks chips)
- `src/components/home/QuickActionsRow.tsx` — launcher-pin tiles
- `src/components/manager/HeadGardenerCard.tsx` + `src/components/AssistantCard.tsx` — AI cards (both densities)
- `src/hooks/useHomeOverview.ts` — the `home-overview` edge-function fetch
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — the telemetry aggregate
- `src/App.tsx` — view-param parsing (~line 511), localStorage persistence (~line 522), four-tab switcher (~line 1672), single-slot onboarding + home render branch (~line 1705)

---

## Quick Summary

One page, two densities — **Simple** (guidance-first, the default) and **Detailed** (telemetry-first, the default for `persona === "experienced"`; localStorage `rhozly:home:density` once toggled). Both share a spine: attention row, Garden Brain brief, adaptive-care card, the location-by-location garden grid, quick actions, a Garden Walk launcher, and a task list. Simple opens with the compact status strip and closes with a compact today's-tasks section plus Seasonal Picks. The **Head Gardener**, **AI Insight**, and Evergreen-gated **Week Ahead** cards render in both densities. Detailed swaps the strip for the full **DailyBriefCard** hero (one greeting — never both), replaces the compact list with the **full TaskList** (Pending/Completed tabs), and appends the collapsible **Garden Snapshot** stat wall. Above the page, App.tsx renders **at most one** onboarding/promo card (single-slot cascade). The grid renders instantly from client-held state; the **`home-overview`** edge function layers live telemetry on top and soft-fails — the page never blocks on it. A **single `useHomeDashboardStats` mount** in HomeMain feeds both the "X of Y done today" summary and the Garden Snapshot — never add a second consumer (the edge fn is uncached).

---

## Role 1 — Technical Reference

### Component graph

- `src/App.tsx` — `/dashboard` route; renders the **four-tab** switcher (`data-testid="dashboard-view-switcher"`: Dashboard / Locations / Calendar / Weather), the sync-status pill, the single-slot onboarding cascade, and the `home` branch
  - **Single-slot onboarding (Phase 4.2)** — at most ONE promo card above HomeMain, priority order:
    1. `GettingStartedChecklist` (`src/components/GettingStartedChecklist.tsx`) — decides its own visibility and reports it via the `onVisibilityChange` prop (`setChecklistSlotVisible`; defaults `true` so nothing below flashes before its queries resolve). See [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md).
    2. Quiz Prompt card (inline in App.tsx; moved here from the old Overview branch) — headline **"Set up your Garden Quiz"**, CTA **"Start the quiz →"** (→ `/profile`); dismiss X opens a confirm row with `quiz-prompt-snooze-14d` / `quiz-prompt-dont-ask-again`, persisted via `onboarding_state.quiz_prompt_snoozed_until`. See [Garden Quiz](../01-onboarding/05-garden-quiz.md).
    3. `NotificationOptInCard` — localStorage-only dismissal. See [Notification Opt-In](../01-onboarding/07-notification-opt-in.md).
    4. `InstallPwaPrompt` — localStorage-only, `beforeinstallprompt`-gated. See [PWA Install Prompt](../01-onboarding/08-pwa-install.md).
  - `HomeMain` (`src/components/home/HomeMain.tsx`) — the page, inside `Suspense` (lazy chunk); calls `useHomeOverview(homeId)` (→ `telemetryByArea` map) and `useHomeDashboardStats(homeId)` (→ today summary + Garden Snapshot)

**Card order — Simple density** (`data-testid="home-main"`):

1. Hero row: `HomeStatusStrip` (greeting + weather / **"X of Y done today"** breakdown / overdue / frost chips) + the density toggle (`home-density-toggle`, buttons `home-density-simple` / `home-density-detailed`)
2. `AttentionRow` — max-4 ranked "needs attention" cards from `home-overview`; `null` when calm
3. `GardenBrainBriefCard` — "Your daily brief" (top 3 items in simple density); self-hides pre-cron. See [Garden Brain](../99-cross-cutting/39-garden-brain.md)
4. `AdaptiveCareCard` — Garden Brain adaptive-care proposals; self-hides when the home has no rows
5. `GardenOverviewGrid` (one `LocationOverviewCard` per location, one `AreaRow` per area) — or the empty-garden setup card (`home-empty-garden`, 3 CTAs) when the home has no locations
6. `QuickActionsRow` — up to 6 launcher-pin tiles + Customise
7. **Garden Walk launcher** (`dash-garden-walk`) — full-width gradient button, renders only when `totalPlants >= 5` (from `stats.garden.totalPlants`); navigates to `/walk` with `state:{ from: "/dashboard" }`
8. Compact today's-tasks section (`home-todays-tasks`) — `TaskList` with `compact` + `targetDate` = today; "See all" (`home-tasks-see-all`) → `/dashboard?view=calendar`
9. `SeasonalPicksCard` (`variant="dashboard"`)

**Card order — Detailed density:**

Detailed density is the desktop "studio" (Phase 6c). On **`xl+` (≥1280px)** HomeMain renders a **two-column** layout — a `xl:grid xl:grid-cols-12` with a `xl:col-span-8` **primary** column (the daily-action flow) and a `xl:col-span-4` **insight rail** (`<aside>`, the glanceable secondary cards). Below `xl` the two columns collapse back into a single stack (primary blocks, then rail blocks). The blocks are extracted to named consts in HomeMain so the same elements feed both the simple single-column path and the detailed two-column path — every `data-testid` is unchanged.

*Primary column (left):*
1. Density toggle (top-right of the column), then the `DailyBriefCard` hero — **replaces** the status strip (one greeting, never both). See [Daily Brief Card](./05-daily-brief-card.md)
2. `AttentionRow`
3. `GardenBrainBriefCard` (all items + reasons in detailed density)
4. `GardenOverviewGrid` (or `home-empty-garden`) in the `home-garden-section` wrapper
5. `QuickActionsRow`
6. Garden Walk launcher (`dash-garden-walk` — **both** densities)
7. **Full `TaskList`** in a `data-testid="dashboard-task-list"` wrapper div — the whole task-management surface (Daily Tasks heading, Pending/Completed tabs), the old Overview TasksPanel role

*Insight rail (right, `<aside>`):*
1. `AdaptiveCareCard`
2. `HeadGardenerCard` in a `data-testid="dashboard-head-gardener-card"` wrapper div (only when `userId`) — self-gates (Evergreen; compact upsell otherwise). See [Head Gardener](./16-head-gardener.md)
3. `AssistantCard userId showUpgradeWhenLocked` in a `data-testid="dashboard-assistant-card"` wrapper div (only when `userId`) — see [AI Assistant Card](./06-assistant-card.md)
4. `WeekAheadPreview` inside `<FeatureGate feature="ai_insights" fallback={null}>` — Evergreen-only (RHO-9)
5. `GardenSnapshot` — the collapsible "This Week at a Glance" stat wall (below)

### GardenSnapshot (`src/components/home/GardenSnapshot.tsx`)

The old Overview stat wall relocated. **Pure presentation** — HomeMain owns `useHomeDashboardStats` and threads `stats / loading / error / refresh / weekStart / weekEnd` down, so mounting it never double-fetches.

- **Header:** "This Week at a Glance" + week range + `dash-refresh` (re-invokes the fetch; spinner while loading).
- **Collapse toggle** (`dash-snapshot-toggle`, `aria-expanded`): localStorage `rhozly:dashboard:snapshot-open`; **default open for `persona === "experienced"`**, collapsed otherwise. Persisted **only on user toggle** (never on mount — persisting the first-render default would freeze it before `usePersona()` resolves); with no stored value an effect follows the persona once it lands.
- **Zero-value tiles are hidden** (`hideWhenZero` + `isZeroValue`): a tile whose value is literal `0` / `"0"` renders nothing, and a section whose tiles all hide drops its header too (`visibleTiles`). **Exceptions that always render:** `dash-stat-tasks-total` and `dash-stat-plants-total`. Formatted strings (`"0mm"`, `"—"`) are deliberately **not** hidden — "no rainfall recorded" and "no streak yet" are real data.
- **Tiles** (all `dash-stat-*`): tasks — `tasks-total`, `tasks-completed`, `tasks-overdue`, `tasks-pending`, `tasks-auto`, `tasks-streak`; garden — `plants-total`, `harvest-blueprints`, `harvest-instances`, `pruning-blueprints`, `pruned-instances`, `general-pruning`; weather — `weather-alerts`, `rainfall`, `skipped-rain`; automations — `auto-runs`, `auto-success`, `auto-failed`, `auto-tasks`; more — `doctor-sessions`, `watchlist-new`. Plus the carried-over line (`dash-tasks-carried-over` / `-prior` / `dash-tasks-completed-this-week`), per-category chips (`dash-cat-*`) and the member breakdown (`dash-member-breakdown-toggle`).
- **7-day Week Overview strip:** each day (`dash-day-{date}`, click → `/dashboard?view=calendar&date={date}`) now renders **stacked dots** — WeekPulse's visual language, max **3 dots per bucket** (`DOTS_PER_BUCKET_CAP`), fixed bucket order, zero-count buckets omitted: **red = overdue, orange = completed late, emerald = on time, neutral = pending** (lighter variants on the today pill). Exact counts stay reachable via per-dot `title`s, the "{n} tasks" sub-label, and the hover/tap `DayLegend` pills (unchanged).
- **Empty garden:** returns `null` when `stats.garden.totalPlants === 0` — the merged home's own `home-empty-garden` card covers new users (the old `EmptyGardenPanel` was deliberately not ported).
- Stat semantics (RHO-13/14/15/16, tz bucketing, split queries) are unchanged from the Overview era — the pure logic lives in `supabase/functions/_shared/dashboardStats.ts` (Deno tests `supabase/tests/dashboardStats.test.ts`).

### Props received

`HomeMain` (all passed from App.tsx state):

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` | Scopes TaskList, stats, SeasonalPicksCard |
| `userId` | `string \| null` | `session.user.id` | Launcher pin revalidation; gates the Detailed AI cards |
| `firstName` | `string \| null` | `profile.first_name` | Greeting (both heroes) |
| `weather` | `any` | App's extracted current weather | Weather chip / DailyBriefCard |
| `rawWeather` | `any` | Latest `weather_snapshots.data` JSONB | Frost derivation |
| `locations` | `OverviewLocation[]` | App's `locations` state | The grid + DailyBriefCard sun fallback |
| `locationTaskCounts` | `Record<string, number>` | App's per-location **remaining-today** counts (ghost-aware, `buildLocationTaskCounts`) | Per-card task chip + summed for the strip / brief |
| `overdueTaskCount` | `number` | App's home-scoped overdue count (RHO-3) | Overdue chip (both heroes) |
| `alerts` | `any[]` | Active `weather_alerts` | DailyBriefCard footer hint |
| `homeLat` / `homeLng` | `number \| null` | App's `homeLatLng` | DailyBriefCard sun calculations |
| `hardinessZone` | `number \| null` | `homes.hardiness_zone` | DailyBriefCard zone chip |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | SeasonalPicksCard AI branch + brief chat chip |
| `isPremium` | `boolean` | `profile.enable_perenual` | SeasonalPicksCard |
| `availabilityCtx` | `QuickLauncherAvailabilityCtx` | Built inline in App.tsx | Filters launcher tiles via `resolvePins` |

### State (local)

- `storedDensity` (`useState`, init-only) — synchronous read of localStorage `rhozly:home:density` at mount.
- `densityOverride` (`"simple" | "detailed" | null`) — the user's explicit choice; seeded from `storedDensity` when valid. When `null` the effective density follows the persona (`persona === "experienced"` → `"detailed"`, everything else — including `null` while `usePersona()` is still loading — → `"simple"`).
- Density is **persisted only on user toggle** (`setDensity` writes localStorage) — never on first render, so the persona default isn't frozen before `usePersona()` resolves (the Garden Snapshot preference lesson).
- App.tsx holds `checklistSlotVisible` (default `true`) — the single-slot gate the checklist reports into via `onVisibilityChange`.

### Data flow — read paths

- **`useHomeDashboardStats(homeId)`** — **mounted once, in HomeMain, for BOTH densities.** Feeds (a) the "X of Y done today" breakdown via `buildTodaySummary` (`src/lib/todaySummary.ts`) — **pending** from the ghost-aware client `locationTaskCounts` sum, **done** from the server's completion-aware `tasks.doneToday` (`computeDoneToday` — a task counts if completed today, incl. overdue/harvest cleared today, or due today and done), **skipped/postponed** from the server `dayStrip` today bucket; (b) `totalPlants` for the walk-launcher gate; (c) the whole GardenSnapshot in detailed density. Soft-fails — null stats still render the strip's pending count. Don't add second consumers: the `home-dashboard-stats` edge fn is uncached.
- **`useHomeOverview(homeId)`** (`src/hooks/useHomeOverview.ts`) — one `home-overview` invoke on mount / home switch (`today` = client-local date). Generation-guarded; **soft-fails** (grid renders without telemetry chips, attention row stays hidden). Returns `{ locations[], attention[] }`; flattened into the `telemetryByArea` map.
- **Homes query (App.tsx `fetchDashboardData`):** `supabase.from("homes").select("*, weather_snapshots(data, updated_at), locations(*, areas(id, name), inventory_items(id, status, area_id, growth_state, plant_name))")` — the grid groups plants by area client-side. Fires on mount, pull-to-refresh, realtime events, revisit. Caching: the dashboard sessionStorage/localStorage snapshot pattern — see [Caching](../99-cross-cutting/14-caching.md).
- **Inventory realtime refetch (App.tsx `handleInventoryRealtime`)** — carries `area_id, growth_state, plant_name` so a realtime refresh doesn't strip the grid's grouping data.
- **`useQuickLauncherPins(userId)`** — localStorage read + background revalidate. See [Quick Access Home](./09-quick-access-home.md).
- **`usePersona()`** — one `user_profiles.select("persona")` read, module-cached; drives the density default, quick-action defaults, and the snapshot-open default.
- **`TaskList`**, **`SeasonalPicksCard`**, **`DailyBriefCard`** (props-only, no fetches), **`HeadGardenerCard`**, **`AssistantCard`**, **`WeekAheadPreview`**, **`GardenBrainBriefCard`**, **`AdaptiveCareCard`** make their own reads exactly as documented on their own surfaces.

### Data flow — write paths

- **Density toggle** → localStorage `rhozly:home:density` only.
- **Snapshot collapse toggle** → localStorage `rhozly:dashboard:snapshot-open` only (on user toggle).
- **Quiz prompt snooze** → `onboarding_state.quiz_prompt_snoozed_until` (14 days or effectively-forever) via `persistQuizPromptSnooze`.
- Everything else is navigation or delegated to child components (TaskList completion, checklist state writes, AssistantCard dismissals — documented on their own surfaces).
- **View persistence (App.tsx, `rhozly_dashboard_view`):** visiting `/dashboard` with an explicit `?view=` writes the *resolved* view (legacy `dashboard` / `overview` persist as `home`). Restore (plain `/dashboard`, once per mount) only accepts `locations | calendar | weather` — stored legacy `"dashboard"` **and** `"overview"` values deliberately fall through to `home`. See [Routing](../99-cross-cutting/21-routing.md).

### Edge functions invoked

- **`home-overview`** (`supabase/functions/home-overview/index.ts`) — the one-call telemetry aggregate for the grid chips + attention row. `requireAuth` + explicit `home_members` membership check (403 `not_a_member`); body `{ homeId, today }`. Home-bounded parallel reads (locations+areas, inventory grouped per area, devices, `latest_device_readings` RPC, snooze-/window-aware open tasks, active `weather_alerts` max 5, failed `automation_runs` max 5, and — only when the home has valves — `valve_events` last 200 + `automation_valve_queue`). Pure logic in `_shared/homeOverview.ts` (Deno tests HOME-OV-001..010): `deriveValveState`, `soilBand` (< 30 dry / > 70 wet), `rankAttention` (overdue → weather alert → failed automation → low battery < 25% → dry soil ≤ 24 h fresh → closing harvest window; capped at 4), `summariseSoilReading`.
- **`home-dashboard-stats`** — via the single `useHomeDashboardStats` mount in HomeMain (both densities). Stat semantics in `_shared/dashboardStats.ts` (split + bounded task queries, `tzOffsetMinutes` local-day bucketing, RHO-13/14/15/16 rules).

See the [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) for registry entries.

### Cron / scheduled jobs that affect this surface

| Cron | What shows up here |
|------|--------------------|
| `sync-weather` (hourly) | Weather + frost chips, DailyBriefCard, snapshot weather tiles (`weather_snapshots` / `weather_alerts`) |
| `analyse-weather` (hourly) | `weather_alerts` → attention row + banner |
| `generate-tasks` (daily) | Task counts (strip/brief chips, per-location chips, both TaskList variants, snapshot tiles) |
| `update-plant-states` (daily) | `inventory_items.growth_state` — the area-row dot colours |
| `garden-brain` (daily) | `daily_briefs` → GardenBrainBriefCard; `care_adjustments` → AdaptiveCareCard |
| `pattern-scan` / `pattern-evaluate` (daily) | `user_insights` → AssistantCard (both densities) |
| `run-automations` (5 min) | May complete tasks; fires valves → ValveChip state on next `home-overview` fetch; snapshot automation tiles |
| `integrations-ewelink-sync` (periodic) | `device_readings` freshness → SensorChip stale-grey |
| `weekly-overview` (weekly) | Feeds WeekAheadPreview's target page |

### Realtime channels

No subscriptions of its own — it **inherits App.tsx's home realtime wiring** (`DashboardRealtimeSubscriber`): `home_id`-filtered `postgres_changes` on `locations` / `areas` → full dashboard refetch; `inventory_items` → the lightweight `handleInventoryRealtime` path; `tasks` → task-count refetch.

### Tier gating

- **The grid, heroes, quick actions, walk launcher and task lists have no tier gate** — identical for Sprout / Botanist / Sage / Evergreen.
- **The merged AI cards render in both densities with their own gates:** `HeadGardenerCard` renders fully on Evergreen, a compact `UpgradeNudge` teaser below (RHO-2). `AssistantCard` is passed `showUpgradeWhenLocked`, so locked tiers (Sprout/Botanist) see a compact one-line upgrade teaser here instead of the card hiding (its behaviour elsewhere). `WeekAheadPreview` sits inside `FeatureGate feature="ai_insights"` with `fallback={null}` — **hidden** below Evergreen (RHO-9).
- `SeasonalPicksCard` keeps its own gating (AI picks for Sage+, deterministic fallback below) — see [Seasonal Picks Card](./14-seasonal-picks.md).
- `AdaptiveCareCard` self-hides by data absence (server writes `care_adjustments` only for sensor-equipped Sage/Evergreen homes). `GardenBrainBriefCard` uses AI voice on Sage/Evergreen, template below.
- Launcher tiles filter by each catalogue entry's `isAvailable(ctx)` predicate.

### Beta gating

None.

### Permissions / role-based UI

None on this surface itself. Child flows enforce their own keys (TaskList completion, drill-in actions).

### Error states

| State | What happens |
|-------|--------------|
| Dashboard fetch failed | The page renders whatever cached state exists. (The explicit "Could not load dashboard data" retry card lives on the Locations sub-tab.) |
| `home-overview` call failed | **Soft-fail by design** — grid renders without sensor/valve/tasks chips; attention row hidden. No error UI. |
| `home-dashboard-stats` failed | Strip still shows the pending count (no done/skipped breakdown); GardenSnapshot shows an inline error + Retry; walk launcher hides (totalPlants unknown → 0). |
| Sensor reading older than 24 h | SensorChip greys out ("Last reading over a day old"). |
| Valve command failed | ValveChip shows red "⚠ Valve failed"; an `automation_failed` attention card may surface. |
| No weather yet | Weather chips / DailyBriefCard weather elements simply don't render. |
| No locations | The 3-CTA setup card (`home-empty-garden`) replaces the grid; GardenSnapshot returns null on zero plants. |
| Location with no areas / area with no plants | Inline "+ Add an area…" CTA / "No plants yet" label. |
| localStorage unavailable | Density + snapshot-open fall back to persona defaults each visit; try/catch swallows writes. |

### Performance notes

- `HomeMain` is `lazy()`-loaded and wrapped in `Suspense`.
- First paint of the grid is pure render over already-fetched state; telemetry hydrates in place from the single `home-overview` round trip.
- **One `useHomeDashboardStats` mount** serves the summary, the walk-launcher gate and the snapshot — the comment in HomeMain explicitly warns against second consumers.
- GardenSnapshot is presentation-only; collapsing it costs nothing (the fetch already happened for the summary).
- Growth-state dots are capped at 5 per row (`+N` overflow); snapshot day-strip dots capped at 3 per bucket.
- `usePersona` is module-cached — one profile read per session across all consumers.

### Onboarding tour

`dashboard_tour` (`src/onboarding/flowRegistry.ts`) targets the merged home in its default Simple density: `dashboard-view-switcher` ("Four views in one"), `home-status-strip`, `home-overview-grid`, `home-quick-actions`, `seasonal-picks-card`, `home-todays-tasks`.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the front door — and now the *only* dashboard. The old two-tab split (a "Home" grid view and a separate "Overview" stats feed) is gone: one page does both jobs, at the depth you choose. Open the app and in one glance you get the weather, the day's workload, anything overdue, a frost warning if one's coming, and a card for every location showing every area and the state of every plant in it.

For Sarah, the newer gardener, **Simple** is calm: a friendly greeting strip, a small set of chips, coloured dots that say "your plants are at these stages", quick actions biased towards learning, a short today's-tasks list and the Seasonal Picks card. If she hasn't set anything up yet, the page becomes a three-step setup card rather than an empty void.

For Marcus, the experienced gardener, **Detailed** (the default once your persona says "experienced") is the whole operations room on one scroll: the full Daily Brief hero, the Head Gardener and AI Insight cards, live sensor/valve telemetry on every area row, the complete task list with Pending/Completed tabs, the Week Ahead preview, and the collapsible **Garden Snapshot** — the week's full stat wall, now decluttered (zero-value tiles hide themselves) with a dot-based seven-day strip.

Nothing was removed in the merge — everything the Overview tab showed lives here, behind the Detailed toggle.

### Every flow on this page

#### 1. The hero — one greeting, two depths

- **Simple:** the status strip — "Good morning, Vinny" plus up to a handful of pill chips: current weather, **"X of Y done today"** with to-do / skipped / postponed breakdown chips, a red overdue chip, a blue "Frost tonight" chip when tonight dips ≤ 3 °C. Tap chips to jump (weather/frost → Weather tab; tasks/overdue → Calendar).
- **Detailed:** the full **Daily Brief** card — the old Overview hero, intact: greeting, synthesised one-liner, stat chips (today/overdue, temp, golden hour, sunset, frost, zone, microclimate), the "Got a plant question?" AI chat chip, and the sunrise/day-length footer. See [Daily Brief Card](./05-daily-brief-card.md).
- You never see both — they're the same job at two depths.

#### 2. Simple / Detailed toggle (top-right)

Two small icon buttons (list = Simple, rows = Detailed). Your choice is remembered on this device; until you ever touch it, the page follows your quiz persona — experienced gardeners start Detailed, everyone else Simple.

#### 3. Needs attention row (both densities; hidden when calm)

Up to four ranked cards: red = overdue tasks, sky-blue = weather alert, amber = failed automation, orange = battery under 25%, yellow = dry soil, lime = harvest window closing. Tap to deep-link. No row = nothing needs you.

#### 4. Daily brief & adaptive care (Garden Brain, both densities)

"Your daily brief" ranks the day's priorities (top 3 in Simple; everything + reasons in Detailed) with a good-news line and 👍/👎. The adaptive-care card proposes watering-blueprint adjustments from sensor evidence. Both self-hide when there's nothing to say.

#### 5. AI cards (Detailed only)

- **Head Gardener** — the Evergreen estate-manager card (compact upgrade teaser below Evergreen).
- **AI Insight** — the pattern engine's read on your behaviour; on this page locked tiers see a one-line upgrade teaser rather than nothing.

#### 6. Garden Overview grid — one card per location

One card per location: indoors/outdoors icon, name, "Outdoors · 3 areas · 12 plants", tasks-today chip, hazard banner, then one row per area with up to 5 growth-state dots (`+N` overflow), plus — when hardware is connected — soil sensor, valve, and per-area task chips. Tap through to the Location drill-in. Areas with a sensor grey their chip when the reading is over 24 h old; a valve only claims "Watering" while its own countdown is genuinely live.

#### 7. Quick actions

Up to 6 tiles — your saved Quick Launcher pins, or persona-aware defaults. Customise opens the picker at `/gardener?section=quick-launcher`; the changes apply here (this is now the only surface the launcher lives on since the `/quick` home was retired).

#### 8. Garden Walk launcher (both densities)

Once you have **5 or more plants**, a full-width "Start a Garden Walk" button appears — a guided check-in on every plant (snap, note, or tick as you go), returning here when you finish.

#### 9. Tasks — compact vs full

- **Simple:** a compact "Today's tasks" list; "See all" opens the Calendar sub-tab.
- **Detailed:** the **full task list** — Daily Tasks heading, Pending/Completed tabs, every action (complete, postpone, photo, detail). The whole task-management surface without leaving the dashboard.

#### 10. Week Ahead (Detailed, Evergreen only)

A sneak-peek card into the weekly overview page. Hidden entirely on other tiers.

#### 11. Garden Snapshot (Detailed only)

"This Week at a Glance" — the old Overview stat wall behind a collapse toggle (open by default for experienced gardeners; your preference sticks). Inside: task tiles (total, completed, overdue, pending, auto-done, streak), the seven-day strip — now **stacked coloured dots** per day (red overdue, orange late, green on time, neutral pending; hover or tap a day for exact pill counts; tap through to that day's calendar) — garden tiles (plants, harvests, pruning), weather, automations and activity tiles, category chips, and the per-member breakdown. **Zero-value tiles hide themselves** (and empty sections drop their headers) so the wall only shows numbers that mean something — only Total Tasks and Active Plants always render. Refresh re-pulls the week.

#### 12. Seasonal Picks (Simple only)

The weekly "what can I grow right now?" card. Detailed hides it to keep the page telemetry-first.

#### 13. First-run cards — one at a time

At most **one** promo card ever shows above the page, in priority order: Getting Started checklist → Garden Quiz prompt ("Set up your Garden Quiz" — snooze 2 weeks or don't-ask-again) → notification opt-in → PWA install. Dismissing one lets the next eligible card claim the slot on a later visit. See the [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) and [Garden Quiz](../01-onboarding/05-garden-quiz.md) references for each card's own rules.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "Good morning / afternoon / evening, [name]" | Time-of-day greeting (both heroes) |
| Weather chip | Current temp + condition from the latest weather snapshot |
| "X of Y done today" | X = tasks completed today (incl. overdue/harvest cleared today) or due-today-and-done; Y = X + remaining (ghost-aware). "No tasks today" when Y = 0 |
| "N to do" / "N skipped" / "N postponed" chips | Today's breakdown (each hidden when 0) |
| Red "N overdue" chip | Pending tasks past due across the whole home |
| Blue "Frost tonight N°" chip | Tonight's forecast minimum, shown only when ≤ 3 °C |
| Daily Brief chips (Detailed) | See [Daily Brief Card](./05-daily-brief-card.md) — today/overdue, temp, golden hour, sunset, frost < 2 °C, zone, microclimate |
| "Needs attention" cards | Ranked triage, max 4: overdue → weather alert → failed automation → low battery → dry soil → closing harvest; hidden when calm |
| Indoors / Outdoors icon | Location's `is_outside` flag |
| Plant dot colours | Sky = Germination, lime = Seedling, green = Vegetative, amber = Budding, pink = Flowering, orange = Fruiting, yellow = Ripening, stone = Senescence, grey = not planted yet |
| "3 flowering · 2 seedling" (Detailed) | Growth-state census of the area |
| Soil chip "OK / Dry / Wet" (Simple) / "45% · 18.5°" (Detailed) | Moisture band (Dry < 30%, Wet > 70%) / exact reading + soil temp; grey = over 24 h stale; battery icon = under 25% |
| "Watering · N min left" / "⚠ Valve failed" / "Next water HH:MM" | Valve run in progress / last command failed / earliest queued run |
| "Start a Garden Walk" | Appears at ≥ 5 plants; guided per-plant check-in |
| Snapshot day-strip dots | Per day, capped at 3 per colour: red = overdue, orange = completed late, green = on time, neutral = pending; "—" = nothing scheduled; hover/tap for exact counts |
| Snapshot tiles | Week-scoped counts; a missing tile means its value was zero (by design) — only Total Tasks and Active Plants always show |
| "N carried over from earlier weeks" | Open overdue from before this week (not folded into the tiles) |
| Quick-action tiles | Your launcher pins (or the persona defaults) |
| "See all" (Simple) | Opens the Calendar sub-tab |

### Tier-by-tier experience

| Tier | Differences on Home |
|------|--------------------|
| Sprout | Full page. Detailed density: Head Gardener + AI Insight show compact one-line upgrade teasers; Week Ahead hidden. Seasonal Picks deterministic. Gated launcher tiles filtered out. |
| Botanist | Same as Sprout. |
| Sage | AI Insight card renders when insights exist; Garden Brain brief uses AI voice; Seasonal Picks AI-personalised; adaptive care active on sensor-equipped homes. Head Gardener still a teaser; Week Ahead still hidden. |
| Evergreen | Everything: Head Gardener full, Week Ahead visible. |

### New user vs returning user vs power user

- **Brand new user** (no locations): greeting + "No tasks today" strip, one onboarding card (the checklist), then the 3-CTA setup card. No snapshot, no walk launcher.
- **Returning user:** glance the strip, scan the dots, tick off today's tasks from the compact list.
- **Power user:** Detailed by default — brief hero, AI cards, telemetry on every row, full task list, snapshot open. The 2-column grid, 5-dot cap and zero-tile hiding keep even large estates on one scrollable screen.

### Beta user experience

No differences (the BetaFeedbackBanner renders app-wide above the page as usual).

### Common mistakes / pitfalls

- **"Where did the Overview tab go?"** Merged into this page (Phase 4.2). Flip the density toggle to **Detailed** — the brief hero, AI cards, full task list, Week Ahead and the stat wall are all there. Old `?view=overview` links land here.
- **Assuming grey dots mean unhealthy.** Grey means *not planted yet*, not sick.
- **Expecting the dots to show all plants.** Only 5 render per row; `+N` covers the rest.
- **"My stats disappeared."** Zero-value snapshot tiles hide themselves — a missing "Overdue" tile means zero overdue, which is good news. Only Total Tasks and Active Plants always render.
- **"The snapshot is collapsed / missing."** It's Detailed-only, collapsible (your toggle sticks), and renders nothing for an empty garden.
- **Toggling density and expecting it to sync across devices.** Per-device preference (localStorage), not a profile setting.
- **Reading a grey soil chip as a live value.** Grey = sensor silent for over 24 hours.
- **Panicking at a missing attention row.** Hidden when calm, not broken.
- **Seeing two promo cards stacked.** Never happens — the slot shows exactly one; the rest queue behind it.
- **Looking for the walk launcher with 3 plants.** It appears at 5+.

### Recommended workflows

- **Morning glance (30 s, Simple):** strip → attention row → scan the grid → tick today's tasks.
- **Estate sweep (Detailed):** brief hero → AI cards → telemetry rows → full task list → snapshot dots for the week's shape.
- **Weekly review:** open the snapshot, read the carried-over line and the day strip, tap any red-dotted day through to its calendar.
- **Making the page yours:** set the density toggle once, collapse or open the snapshot once, customise the quick actions once — all three stick.

### What to do if something looks wrong

- **Counts or dots look stale:** pull to refresh; the sync pill above shows staleness.
- **A plant is missing from its area's dots:** check the "Not in an area yet" row.
- **The page keeps opening in the wrong density:** a stored toggle wins over the persona default — toggle it back.
- **The snapshot shows an error card:** tap Retry (the stats fetch failed; the rest of the page is unaffected).
- **Sensor/valve chips vanished:** the telemetry call soft-failed this visit — reload; if persistent, check the device on Integrations.
- **An old `?view=overview` bookmark "doesn't work":** it works — it lands here by design; switch to Detailed for the old content.

---

## Related reference files

- [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md) — where the merged-away Overview tab's pieces went
- [Daily Brief Card](./05-daily-brief-card.md) — the Detailed-density hero
- [AI Assistant Card](./06-assistant-card.md) — Detailed density, with `showUpgradeWhenLocked`
- [Head Gardener](./16-head-gardener.md) — the card's parent surface (`/manager`)
- [Weekly Overview Page](./15-weekly-overview.md) — WeekAheadPreview's target
- [Locations Tab](./02-locations-tab.md), [Calendar Tab](./03-calendar-tab.md), [Weather Tab](./04-weather-tab.md) — the other three sub-tabs
- [Location Page (Drill-In)](./07-location-page.md) — where card headers and area rows land
- [Quick Access Home](./09-quick-access-home.md) — **RETIRED (2026-07-20)**; its customisable launcher catalogue + pins now live here in `QuickActionsRow`
- [Garden Walk](./13-garden-walk.md) — the walk launcher's destination
- [Seasonal Picks Card](./14-seasonal-picks.md) — Simple density
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md), [Garden Quiz](../01-onboarding/05-garden-quiz.md), [Notification Opt-In](../01-onboarding/07-notification-opt-in.md), [PWA Install Prompt](../01-onboarding/08-pwa-install.md) — the single-slot cascade
- [Routing](../99-cross-cutting/21-routing.md) — `?view=` params, legacy `dashboard`/`overview` fallthrough, localStorage persistence
- [Garden Brain](../99-cross-cutting/39-garden-brain.md) — brief + adaptive care
- [Pattern Engine](../99-cross-cutting/26-pattern-engine.md) — feeds AssistantCard
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — FeatureGate / ai_insights
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md), [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md), [Data Model — Integrations](../99-cross-cutting/09-data-model-integrations.md)
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `home-overview`, `home-dashboard-stats`
- [Weather](../99-cross-cutting/27-weather.md), [Realtime](../99-cross-cutting/15-realtime.md), [Caching](../99-cross-cutting/14-caching.md), [Onboarding State](../99-cross-cutting/30-onboarding-state.md)

## Code references for ongoing maintenance

- `src/components/home/HomeMain.tsx` — page entry; density state, both density card orders, the single `useHomeDashboardStats` mount, `telemetryByArea` threading, walk launcher, empty-garden card
- `src/components/home/GardenSnapshot.tsx` — collapse toggle, zero-tile hiding (`isZeroValue` / `visibleTiles`), dot-based day strip (`DOTS_PER_BUCKET_CAP`), DayLegend
- `src/components/DailyBriefCard.tsx` — Detailed hero
- `src/components/manager/HeadGardenerCard.tsx` / `src/components/AssistantCard.tsx` — Detailed AI cards
- `src/components/shared/WeekAheadPreview.tsx` + `src/components/shared/FeatureGate.tsx` — the gated week-ahead card
- `src/components/home/HomeStatusStrip.tsx` — Simple hero chips + frost derivation
- `src/components/home/AttentionRow.tsx` — kind → icon/colour map, deep-link routing
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the grid + `SensorChip` / `ValveChip` / tasks chip
- `src/components/home/GardenBrainBriefCard.tsx` / `AdaptiveCareCard.tsx` — Garden Brain cards
- `src/components/home/QuickActionsRow.tsx` — pins → tiles
- `src/components/TaskList.tsx` — compact (Simple) and full (Detailed) variants
- `src/hooks/useHomeDashboardStats.ts` / `src/lib/todaySummary.ts` — the shared stats mount + today summary
- `src/hooks/useHomeOverview.ts` — generation-guarded, soft-failing telemetry fetch
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — telemetry aggregate (Deno tests `supabase/tests/homeOverview.test.ts`)
- `supabase/functions/home-dashboard-stats/index.ts` + `supabase/functions/_shared/dashboardStats.ts` — stat semantics (Deno tests `supabase/tests/dashboardStats.test.ts`)
- `src/App.tsx:~511` — `DashboardView` parsing (`home | locations | calendar | weather`; legacy `dashboard`/`overview` → `home`)
- `src/App.tsx:~522` — `rhozly_dashboard_view` persistence + legacy fall-through
- `src/App.tsx:~1672` — four-tab switcher; `~1705` — single-slot onboarding cascade + HomeMain mount
- `src/onboarding/flowRegistry.ts` — `dashboard_tour` (home anchors)
- `src/lib/quickLauncherCatalogue.ts` / `src/lib/quickLauncherPrefs.ts` / `src/hooks/usePersona.ts`
- `tests/e2e/specs/home-main.spec.ts` + `tests/e2e/pages/HomeMainPage.ts` — HOME-001..008 (HOME-001 asserts 4 tabs; HOME-004 asserts `?view=overview` falls through to `home-main`)
- `tests/e2e/pages/DashboardPage.ts` — `goto()` seeds `rhozly:home:density = detailed` then visits plain `/dashboard` (classic-content specs ride on that)
- `docs/plans/new-home-dashboard.md` + `docs/plans/hyperplexed-ui-craft-overhaul.md` (§4.2 — the merge)
