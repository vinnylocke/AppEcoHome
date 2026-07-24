# Calendar Section (CalendarHub)

> The one place time-and-schedule work lives: your task **Calendar**, the **Weather** forecast, and your recurring-care **Routines** — three tabs under a single top-level section, pulled out of the Dashboard and the Planner in the #12 IA reorg.

**Route / how to reach it:** `/calendar` (default = Calendar tab · `?tab=weather` · `?tab=routines`). Nav: the **Calendar** item in the sidebar/Shelf **Garden** group (after Dashboard + Plants). On phone: **More → Shelf → Calendar** (no Deck slot). Legacy `/dashboard?view=calendar` → `/calendar`, `/dashboard?view=weather` → `/calendar?tab=weather`, and `/schedule` → `/calendar?tab=routines` all redirect in.
**Source files (entry points):**
- `src/components/CalendarHub.tsx` — the hub shell
- `src/components/TaskCalendar.tsx` — Calendar tab
- `src/components/WeatherForecast.tsx` + `src/components/WeatherAlertBanner.tsx` — Weather tab
- `src/components/BlueprintManager.tsx` — Routines tab (rendered `embedded`)

---

## Quick Summary

CalendarHub is a thin `SegmentedTabs` shell (the same pattern as `JournalNotesHub`) that hosts three surfaces that all answer "when does stuff happen in my garden?": the month/week task **Calendar**, the 7-day **Weather** forecast, and the **Routines** that generate recurring tasks. Before #12 these were scattered — Calendar + Weather were `?view=` sub-tabs of the Dashboard, and Routines was buried in the Planner and at a standalone `/schedule`. This section reunites them and declutters the Dashboard down to home-only.

---

## Role 1 — Technical Reference

### Component graph

- `CalendarHub` (`src/components/CalendarHub.tsx`) — root `h-full flex flex-col`; a non-growing `SegmentedTabs` header (`data-testid="calendar-hub-switch"`) over a `flex-1 overflow-auto` content pane. Reads `?tab=` (`weather` / `routines`, else default `calendar`) and writes it via `setSearchParams({ replace: true })` (default tab clears the param for a clean URL). Resets the content-pane scroll to top on tab change.
  - `SegmentedTabs` (`src/components/ui/SegmentedTabs.tsx`) — tabs `calendar-hub-tab-calendar` / `calendar-hub-tab-weather` / `calendar-hub-tab-routines` (`role="tab"`).
  - **Calendar tab** → `TaskCalendar` (self-pads, fills `h-full`, own agenda scroll). See [Calendar Tab](./03-calendar-tab.md).
  - **Weather tab** → `WeatherAlertBanner` (full `isForecastScreen` banner) + `WeatherForecast`, or a two-block skeleton while the first weather fetch is in flight. See [Weather Tab](./04-weather-tab.md).
  - **Routines tab** → `BlueprintManager` `embedded` (recurring care rules + Suggestions/Optimise). See [Blueprint Manager](../04-planner/07-blueprint-manager.md).

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `App.tsx` (`profile.home_id`) | Scopes every child query |
| `locations` | `any[]` | `App.tsx` dashboard fetch | Passed to `TaskCalendar` as `preloadedLocations` |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | Passed to `TaskCalendar` + `BlueprintManager` |
| `rawWeather` | `any` | `App.tsx` `fetchDashboardData` | Weather-tab forecast data |
| `alerts` | `any[]` | `App.tsx` `fetchDashboardData` | Weather-tab alert banner |
| `weatherLoading` | `boolean` | `!dashboardLoaded && !rawWeather` | Show the skeleton until weather resolves |
| `onWeatherRefresh` | `() => void \| Promise<void>` | `fetchDashboardData` | Weather-tab manual refresh |

### State (local)

- `tab` — derived from `?tab=` (not `useState`); the URL is the source of truth.
- `scrollRef` — ref to the content pane, reset to top on `tab` change.

CalendarHub holds **no data state of its own** — it is a pure router into three existing components. Weather data is fetched once, globally, by `App.tsx` on home load (the app-wide compact alert bar already depends on it) and handed down as props.

### Data flow — read paths

None at the hub level. All reads belong to the child surfaces:
- Calendar → `TaskEngine.fetchTasksWithGhosts()` etc. (see [Calendar Tab](./03-calendar-tab.md)).
- Weather → data arrives via props from `App.tsx`'s dashboard fetch (`fetch-weather` snapshot); see [Weather](../99-cross-cutting/27-weather.md).
- Routines → `BlueprintManager`'s own `task_blueprints` reads (see [Blueprint Manager](../04-planner/07-blueprint-manager.md)).

### Data flow — write paths

None at the hub level. Tab switches only rewrite `?tab=` (`replace: true`, no history spam). Child surfaces own all mutations (task completion, blueprint CRUD, weather refresh).

### Edge functions invoked

None directly. Children invoke their own (e.g. `TaskCalendar`/`BlueprintManager` task generation; weather via `App.tsx`).

### Cron / scheduled jobs that affect this surface

- Weather snapshots (`fetch-weather`) feed the Weather tab.
- `weekly-digest` emails deep-link to `/calendar?date=…` and `/calendar` (repointed from `/dashboard?view=calendar` in #12).
- `daily-brief` / `home-overview` / insight sources deep-link to `/calendar` and `/calendar?tab=weather`.

### Realtime channels

None at the hub level; children subscribe as before.

### Tier gating

The hub is ungated. Tier differences live in the children: the Weather tab's Garden Intelligence and the Routines tab's Suggestions/Optimise follow their existing gates (see [Weather Tab](./04-weather-tab.md), [Optimise Tab](../04-planner/08-optimise-tab.md)). `aiEnabled` is threaded through so AI affordances hide for non-AI tiers.

### Beta gating

None specific to the hub.

### Permissions / role-based UI

The hub renders for any home member. The Routines tab's create/edit affordances gate on `can("tasks.create_home")` inside `BlueprintManager` (a viewer sees a read-only list).

### Error states

- **Weather not yet loaded** → the Weather tab shows a two-block pulse skeleton (`weatherLoading`).
- **No `homeId`** → the `/calendar` route renders `null` until the profile resolves (same guard as sibling routes).
- Child surfaces own their own network/empty/error states.

### Performance notes

- `CalendarHub` is lazy-loaded (`lazyWithRetry`), so `TaskCalendar` / `WeatherForecast` / `BlueprintManager` no longer sit in the eager `App.tsx` bundle (they moved out of the deleted dashboard branches into this lazy chunk).
- Only the active tab's child mounts; switching unmounts the previous one.

### Linked storage buckets

None at the hub level.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is your garden's **diary and its weather window in one place**. When you want to know *what needs doing and when* — today's watering, this week's pruning, the harvest that's about to open — you open the Calendar. When you want to know whether the sky is about to help or hurt — frost tonight, a heatwave building, rain that saves you a watering — you flick to Weather. And when you want to set care on autopilot — "water the tomatoes every 4 days, feed every fortnight" — you flick to Routines.

For **Sarah (amateur)**, keeping these three together removes the guesswork of "where did the calendar go?" — it's one tap from the nav, always in the same spot. For **Marcus (expert)**, it's the operational cockpit: agenda, forecast, and recurring-care rules side by side, so planning the week is a single visit rather than three.

Before this reorg the Calendar and Weather were pill-tabs buried on the home screen and Routines lived awkwardly inside the Planner. Pulling them into their own section means the home Dashboard stays calm and glanceable, and the scheduling work has room to breathe.

### Every flow on this page

1. **Switch tabs** — the pill switcher at the top (Calendar · Weather · Routines). Tapping swaps the surface in place and updates the URL (`/calendar`, `/calendar?tab=weather`, `/calendar?tab=routines`) so you can bookmark or share a specific tab. *Beginner:* three clearly-labelled buttons. *Expert:* keyboard arrows move between tabs (selection follows focus).
2. **Calendar tab** — month/week grid + a day agenda; add tasks, reschedule by drag, export ICS. (Full detail: [Calendar Tab](./03-calendar-tab.md).)
3. **Weather tab** — 7-day forecast, sunrise/sunset, and the Garden Intelligence rules (auto-watering, frost, heat, wind). The full alert banner sits at the top here (the slim app-wide alert strip hides on this tab to avoid doubling up). (Full detail: [Weather Tab](./04-weather-tab.md).)
4. **Routines tab** — your recurring-care rules and the Suggestions/Optimise helper. (Full detail: [Blueprint Manager](../04-planner/07-blueprint-manager.md).)

### Information on display — what every field means

The hub itself only shows the three-tab switcher; every number, chip, and colour belongs to the active child surface — see the linked Calendar / Weather / Blueprint-Manager references for those.

### Tier-by-tier experience

- **Sprout / Botanist** — full Calendar + Weather forecast + Routines list. AI-flavoured extras (some Garden Intelligence depth, Suggestions/Optimise ideas) are gated in the children.
- **Sage / Evergreen** — the AI affordances in the Weather and Routines tabs light up.

### New user vs returning user vs power user

- **Brand new** (no plants/tasks): the Calendar is quiet ("Nothing scheduled"), Weather still shows the forecast, Routines invites you to create your first recurring rule.
- **Returning**: open Calendar, glance at today's agenda, tick things off.
- **Power user**: use Weather to plan around frost/heat, then Routines → Suggestions to consolidate an over-full schedule.

### Beta user experience

No section-specific beta surface.

### Common mistakes / pitfalls

- **"Where did Calendar/Weather go?"** — they're no longer on the home Dashboard; they moved here (the nav's **Calendar** item, in the Garden group). Old `/dashboard?view=calendar|weather` links still redirect here.
- **"Where did Routines go?"** — out of the Planner and into this section's Routines tab. `/schedule` still works (it redirects).

### Recommended workflows

1. **Plan the week** — Calendar tab (see the agenda) → Weather tab (check frost/heat/rain) → back to Calendar to add/reschedule.
2. **Set care on autopilot** — Routines tab → New Routine (e.g. water every 4 days) → it starts generating tasks that show up on the Calendar.

### What to do if something looks wrong

- **Weather stuck on the skeleton?** It loads with the rest of the home data — pull-to-refresh or re-open; if the home is still loading, give it a moment.
- **A tab looks empty?** Confirm a home is selected; each tab's own reference has recovery steps.

---

## Related reference files

- [Calendar Tab](./03-calendar-tab.md) — the Calendar tab (`TaskCalendar`)
- [Weather Tab](./04-weather-tab.md) — the Weather tab (`WeatherForecast`)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md) — the Routines tab (`BlueprintManager` embedded)
- [Home (Main Dashboard)](./17-home-main.md) — the now home-only Dashboard the Calendar/Weather left
- [Planner Dashboard](../04-planner/01-planner-dashboard.md) — the Planner the Routines tab left
- [Routing](../99-cross-cutting/21-routing.md) — the `/calendar` section, `?tab=` params, `/schedule` + `?view=` redirects
- [Sidebar Navigation](../09-persistent-ui/02-sidebar.md) — the Calendar nav item + the Planner→Plan rename
- [Bottom Tab Bar](../09-persistent-ui/11-bottom-tab-bar.md) — why Calendar has no Deck slot
- [Weather](../99-cross-cutting/27-weather.md) — snapshots + rules feeding the Weather tab
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — blueprints/ghosts behind Calendar + Routines

## Code references for ongoing maintenance

- `src/components/CalendarHub.tsx` — the hub shell (tabs, props, scroll reset)
- `src/App.tsx` — the `/calendar` route, `/schedule` redirect, and the `/dashboard` legacy `?view=` → `/calendar` redirect; the `calendar` `TAB_URL` entry + Garden-group nav item
- `src/components/TaskCalendar.tsx` — Calendar tab (consumes `?open=add-task` / `?date=`)
- `src/components/WeatherForecast.tsx`, `src/components/WeatherAlertBanner.tsx` — Weather tab
- `src/components/BlueprintManager.tsx` — Routines tab (rendered `embedded`)
