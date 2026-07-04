# Dashboard Tab (Overview)

> The classic scrollable feed that tells you what's happening in your garden today and what to do next — now the **"Overview"** sub-tab. Plain `/dashboard` lands on the new [Home (Main Dashboard)](./17-home-main.md).

**Route:** `/dashboard?view=overview` (the sub-tab strip uses `?view=home|overview|locations|calendar|weather`; `home` is the default and is labelled "Dashboard". Legacy `?view=dashboard` deep links now map to `home` — see [Routing](../99-cross-cutting/21-routing.md)).
**Source files (entry points):**
- `src/App.tsx` (lines ~979–1273) — renders the `/dashboard` route and houses the sub-tab switcher
- `src/components/HomeDashboard.tsx` — the weekly stats + today's tasks panel
- `src/components/DailyBriefCard.tsx` — the hero card at the top
- `src/components/AssistantCard.tsx` — the AI Insight card
- `src/components/GettingStartedChecklist.tsx` — first-run onboarding card
- `src/components/NotificationOptInCard.tsx` — one-time browser-permission ask
- `src/components/InstallPwaPrompt.tsx` — `beforeinstallprompt` capture

---

## Quick Summary

The Overview sub-tab opens with a personalised greeting (Daily Brief), then layers on any urgent prompts (onboarding checklist, notification opt-in, quiz reminder), an AI Insight card if the pattern engine has surfaced one, and finally the Home Dashboard — a weekly stats strip plus today's task list. Its content is **unchanged** by the new-home-dashboard work — only the label and view param changed: the default `/dashboard` landing is now the [Home view](./17-home-main.md), and this page is one tap to the right.

---

## Role 1 — Technical Reference

### Component graph

```
/dashboard route (App.tsx)
├── WeatherAlertBanner (when alerts present)
├── Sub-tab strip (Dashboard / Overview / Locations / Calendar / Weather)
├── Sync status indicator (top-right of body)
├── Shared by BOTH the "home" and "overview" branches (hoisted above the split):
│   ├── GettingStartedChecklist (conditional — onboarding not complete)
│   ├── NotificationOptInCard (conditional — first session, permission default)
│   └── InstallPwaPrompt (conditional — beforeinstallprompt fired)
└── dashboardView === "overview"   ← this page (the "home" branch renders HomeMain — see 17-home-main.md)
    ├── DailyBriefCard (always)
    ├── Quiz Prompt Card (conditional — quiz not completed & not dismissed; renders ONLY here, not on the Home view)
    ├── AssistantCard (conditional — user_insights row exists)
    └── HomeDashboard (always)
        ├── TodayFocusCard (variant: "dashboard")
        ├── WeekAheadPreview (sneak-peek card → /weekly; wrapped in
        │      <FeatureGate feature="ai_insights" fallback={null}> — RHO-9,
        │      Evergreen-only, hidden for Sprout/Botanist/Sage)
        ├── Header (weekly date range + Refresh)
        ├── SeasonalPicksCard (variant: "dashboard")
        ├── Week strip with day chips
        ├── Today's tasks (filtered TaskList)
        └── Plant count summary
```

### State (App.tsx-level)

The `/dashboard` content is driven by state held in the `AppShell` component:

| State | Type | Purpose |
|-------|------|---------|
| `profile` | `UserProfile \| null` | Active home + tier + flags |
| `locations` | `Location[]` | List of locations for this home (preloaded) |
| `weather` | `extracted weather \| null` | Current weather (parsed from `rawWeather`) |
| `rawWeather` | `WeatherSnapshot \| null` | Latest `weather_snapshots` row's `data` JSONB |
| `alerts` | `WeatherAlert[]` | Active `weather_alerts` rows |
| `locationTaskCounts` | `Record<locationId, number>` | Today's task count per location. The blueprint projection now excludes **archived** (`is_archived = false` on the fetch) and **paused** blueprints (occurrences before `paused_until` never count — mirroring the TaskEngine pause rule), respects **Skipped tombstones** (a Skipped row still suppresses its blueprint's ghost but is excluded from the visible count), and counts a **windowed harvest blueprint once** while today is inside its window (instead of on every freq-aligned day) |
| `overdueTaskCount` | `number` | Count of pending overdue tasks **across the whole home** (home-scoped, RHO-3). Computed in `fetchDashboardData` by fetching home-scoped candidate rows and filtering them through `taskFilters.isTaskOverdueToday` — the same predicate the task list uses — so the Daily Brief "Overdue" chip agrees with the list below it. Previously location-scoped, which excluded home/personal-scoped (NULL-location) tasks and disagreed with the list. The query now runs **outside the locations branch** (RHO-3 residual): a home with zero locations but home/personal tasks previously never ran it and cached a hard 0 into the dashboard snapshot |
| `homeLatLng` | `{ lat, lng } \| null` | For sun calculations on DailyBriefCard |
| `hardinessZone` | `number \| null` | USDA zone on the homes table |
| `dashboardLoaded` | `boolean` | Has `fetchDashboardData()` resolved at least once |
| `isRefreshing` | `boolean` | Pull-to-refresh in flight |
| `dashboardError` | `boolean` | Last fetch failed |
| `lastSyncedAt` | `number \| null` | Epoch ms of last successful fetch — used by sync indicator |
| `quizCompleted` | `boolean \| null` | From profile; gates the quiz prompt card |
| `quizPromptDismissed` | `boolean` | LS-backed dismissal of the quiz card |
| `onboardingState` | `OnboardingState` | The profile's onboarding_state jsonb |

### Data flow — read paths

#### 1. `fetchDashboardData()`

Fires on:
- Mount (once profile is loaded)
- Pull-to-refresh
- `home_data` realtime event (locations / weather changes)
- Inventory realtime event (compact path — counts only)
- Visiting `/dashboard` after being away (route effect)
- Manual refresh button on the Locations sub-tab

What it calls (parallel `Promise.all`):
- `supabase.functions.invoke("home-dashboard-stats", { body: { homeId } })` — returns `{ locations, weather, alerts, ... }` (**NOT** `location_task_counts`/`overdue_count` — see drift note below)
- `supabase.from("user_profiles").select("...").eq("uid", userId).maybeSingle()` — refresh AI flags / preferences

> **Drift correction (RHO-20):** `location_task_counts` and `overdue_count` are **not** returned by `home-dashboard-stats`. They are computed **client-side** in `App.tsx` `fetchDashboardData` (from the `homes` query + ghost projection). Ghost (unmaterialised recurring) tasks only exist client-side, so the per-location "today" count must be computed there. The `home-dashboard-stats` edge fn returns the aggregate `tasks` stats + the 7-day `dayStrip` (which now also carries `skipped` + `postponed` per day — RHO-20), sourced only from persisted rows.

Output shape from `home-dashboard-stats`:

```ts
{
  locations: Array<{ id, name, is_outside, areas: Area[], light_intensity_lux: number | null, ... }>,
  weather:   { temp, summary, code, icon, ...derived } | null,
  rawWeather: WeatherSnapshot["data"] | null,
  alerts:    Array<{ id, severity, title, description, ... }>,
  // NB: location_task_counts / overdue_count are computed CLIENT-SIDE in
  // App.tsx fetchDashboardData (ghost-aware), NOT returned here (RHO-20).
  home_lat: number | null,
  home_lng: number | null,
  hardiness_zone: number | null,
}
```

**Caching:**
- `sessionStorage.weather_cache_<homeId>` and `locations_cache_<homeId>` for fast first paint
- `lastSyncedAt` written to drive the "Synced Xs ago" indicator
- The edge function itself uses `ai_response_cache` only for the parts of its work that hit Gemini

**Race guards (2026-07-02):**
- **Once-per-home cache hydration:** the localStorage dashboard snapshot (see [Caching](../99-cross-cutting/14-caching.md)) hydrates state only **once per home per session**. Previously the hydrate ran on *every* invocation, so a failed revalidation rewound live state to the last snapshot.
- **Generation guard:** each `fetchDashboardData` invocation takes a generation ticket; if a newer fetch (or a home switch) supersedes it, the stale in-flight response is discarded instead of overwriting the current home's state.

**RLS / auth:** the edge function uses `requireAuth(req, supabase)`. Membership of the home is verified via `home_members`.

#### 2. `useAchievements(userId, homeId)`

For the badge count under the Daily Brief greeting on `/dashboard`. Reads `unlocked_achievements` table joined with the static `ACHIEVEMENTS` array.

#### 3. `useReleaseNotes()`

Used by App.tsx (not directly on Dashboard) to detect version change and auto-open the ReleaseNotesModal — appears on top of `/dashboard` if the user hasn't seen the latest notes.

#### 4. AssistantCard

Reads `user_insights` rows for this user where `dismissed_at IS NULL`, orders by `created_at desc`, limits 20.
Marks the top result's `surfaced_at` when first shown.
Self-resolves the user ID via `supabase.auth.getUser()` — drop-in on any screen.

#### 5. GettingStartedChecklist

Reads onboarding progress from `user_profiles.onboarding_state` jsonb. Compares against the canonical step list to decide whether to render. Marks steps complete when the user finishes the corresponding action.

#### 6. NotificationOptInCard

Checks `Notification.permission`. If `"default"` and the LS flag `rhozly_notif_opt_in_dismissed` isn't set, renders. Tapping triggers `Notification.requestPermission()`.

### Data flow — write paths

Most writes on Dashboard happen via child components (TaskList toggling completion, etc.). The Dashboard surface itself triggers:
- Onboarding state writes via `GettingStartedChecklist.onStateChange` → `user_profiles.onboarding_state`
- Quiz prompt dismissal: localStorage only
- Notification card dismissal: localStorage only
- Manual refresh button: triggers `fetchDashboardData`, no DB write

### Edge functions invoked

| Function | When | Input | Output | Downstream effect |
|----------|------|-------|--------|--------------------|
| `home-dashboard-stats` | On every fetchDashboardData | `{ homeId }` | See above | None — read-only aggregator |
| `app-help` | Indirectly via Help Center button (top nav) | `{ query, page }` | Markdown answer | None — read-only |

#### Garden Snapshot stat semantics (RHO-13 / 14 / 15 / 16)

The Garden Snapshot's weekly counts come from `home-dashboard-stats`. The pure count logic lives in `supabase/functions/_shared/dashboardStats.ts` (Deno-tested in `supabase/tests/dashboardStats.test.ts`).

- **Task query is split + bounded** — the old single widened query (`due_date <= weekEnd OR window_end_date >= weekStart`) matched every historical Completed/Skipped row the home ever had, and PostgREST's `max_rows=1000` **silently truncated** it — every count quietly degraded once a home passed 1,000 task rows. The function now runs two queries: (1a) **open (Pending) tasks**, widened (`due_date <= weekEnd OR window_end_date >= weekStart`, mirroring `taskEngine.ts`) so overdue-from-prior-weeks and pre-week-start harvest windows load; (1b) **resolved (Completed/Skipped) tasks bounded to this week's activity** — due (or window) inside the week, or `completed_at` within the week. Both select `inventory_item_ids` + `blueprint_id` for the RHO-16 dedup.
- **Local-day bucketing (`tzOffsetMinutes`):** the client sends `new Date().getTimezoneOffset()`; the server uses it (`completedDateLocal` in `_shared/dashboardStats.ts`) to bucket UTC `completed_at` timestamps onto the client's **local** calendar days — evening completions were falling into the next day's counts (and a Saturday-evening completion in the Americas fell out of the week entirely). Older clients that omit it keep UTC behaviour.
- **Total / Overdue / Pending (RHO-14):** Total + Pending stay **week-scoped** (effective span intersects the ISO week); **Overdue is computed over the full widened set** (all not-Completed/Skipped with effective due `< today`, snooze- and harvest-window-aware) so overdue "no matter how old" is reflected.
- **Carried-over line (RHO-14 "additional count"):** a small line above the headline tiles (`dash-tasks-carried-over`) shows `priorOverdue` (open overdue whose effective due `< weekStart`) and `completedThisWeek`. These are **not** folded into the headline tiles. The Deno function does not materialise ghost tasks — a documented limitation to verify on-device.
- **Total Tasks tile route (RHO-13):** navigates to `/dashboard?view=calendar&date=<today>` (matching every sibling tile), **not** `/schedule` (Routines / BlueprintManager).
- **Week Overview day strip (RHO-15):** prior-week overdue rolls onto the **Sunday** bucket — but a **closed harvest window that straddles into this week is no longer double-counted** (once on Sunday + once per in-window day): windowed tasks whose window reaches into the week are excluded from the Sunday roll-up and handled by the per-day branch only. Harvest-window tasks count on **every** in-window day; each day shows overdue + pending. A window task is labelled **"late" only when completed after the window end** (`completed > window_end_date`) — the per-day cursor comparison used to paint orange "late" pips on in-window days before the completion date.
- **Harvests Due (RHO-16):** = distinct plants + each unlinked harvest counts as 1, over harvests whose window overlaps the week. Subject key = `plant:<inventory_item_id>` for linked, else `harvest:<blueprint_id ?? id>`. Completed harvests use the same subject-keyed dedup.
- **Open/collapsed preference:** the Garden Snapshot's expanded state (localStorage-backed, persona-aware default: open for `experienced`) persists **only when the user toggles it**. The old persist-on-mount effect froze the first-render default forever — `usePersona()` resolves after first render, so an experienced user's open-by-default was written as "false" on their first visit and never recovered. With no stored preference, the state follows the persona once it resolves.

### Cron / scheduled jobs that affect this surface

| Cron | Cadence | What it produces that Dashboard reads |
|------|---------|---------------------------------------|
| `sync-weather` | Hourly | `weather_snapshots` rows + `weather_alerts` rows |
| `analyse-weather` | Hourly (after sync) | Updates `weather_alerts` based on rules in `_shared/weatherRules/*` |
| `generate-tasks` | Daily (early AM) | Materialises blueprint tasks for today |
| `update-plant-states` | Daily | Advances `inventory_items.growth_state`, sets `expected_harvest_date` |
| `pattern-scan` | Daily | Runs detectors in `_shared/patterns/*`, writes `user_pattern_hits` |
| `pattern-evaluate` | After scan | Promotes hits into `user_insights` rows — what AssistantCard renders |
| `daily-batch-notifications` | Daily | Sends push notifications for today's tasks |
| `refresh-behaviour-summary` | Weekly | Rebuilds `user_behaviour_summary` rows used by Gemini calls for personalisation |
| `run-automations` | Frequent (5 min) | May complete tasks based on integrations; refresh shows them done |

### Realtime channels

App.tsx wraps everything in `HomeRealtimeProvider` and subscribes via `DashboardRealtimeSubscriber`:
- `home_id`-filtered `postgres_changes` on `locations`, `areas`, `inventory_items`, `tasks`, `weather_snapshots`, `weather_alerts`
- On change, calls `handleHomeDataRealtime` / `handleInventoryRealtime` which clear the session caches and re-fetch.

### Tier gating

- **Sprout** (free): full Dashboard. The Head Gardener card and the AI Insight card each render a **compact one-line upgrade teaser** (`UpgradeNudge compact`) instead of the feature — discoverable but unobtrusive (RHO-2; previously these were either full-size upsell panels that dominated the screen or hidden entirely).
- **Botanist** (paid, no AI): same as Sprout — compact upgrade teasers for both cards.
- **Sage** (paid + AI): AssistantCard surfaces user_insights; the Head Gardener card is still a compact teaser (Head Gardener is Evergreen-only).
- **Evergreen** (top): both the Head Gardener card and the AI Insight card render fully.

The **Week Ahead card** (`WeekAheadPreview`, deep-links to the Evergreen-only `/weekly` overview) is gated behind `ai_insights` with `fallback={null}` — so it is **hidden for Sprout / Botanist / Sage** and only shown for Evergreen (RHO-9). Previously it rendered for everyone and led Sprout users into a full-size upsell page. The gate resolves the tier itself via `useEntitlements`; no tier prop is plumbed from `App.tsx`, so there can be a brief flash before the cached tier resolves.

> Note: the compact teaser on `AssistantCard` is opt-in via `showUpgradeWhenLocked` — only the Dashboard passes it. On Planner/Shed the AssistantCard still hides entirely when locked.

### Beta gating

- **BetaFeedbackBanner** renders above the Dashboard for `profile.is_beta = true` — separate component, not part of the Dashboard tab itself but visually overlaps.

### Permissions / role-based UI

Multi-member homes use `home_members.permissions` jsonb checked via `can(...)`:
- No Dashboard element is currently permission-gated. Child components (TaskList task completion, plant card archive) are.

### Error states

| State | Trigger | What the user sees |
|-------|---------|--------------------|
| `dashboardError = true` | `home-dashboard-stats` failed | Inline "Could not load dashboard data" card with Retry button on the Locations sub-tab |
| Network offline | `navigator.onLine === false` | OfflineBadge in header; reads still resolve from cached state, writes queue via offlineQueue |
| Auth expired | Supabase returns 401 | Caught at `Sentry.ErrorBoundary` → ErrorPage with error ID |
| Quiz not completed | `profile.quiz_completed = false` | Renders the Quiz Prompt Card with a confirm-dismiss flow |
| New session, no plants | `home-dashboard-stats` returns empty arrays | Empty state messaging within HomeDashboard component |

### Performance notes

- `HomeDashboard` is `lazy()`-loaded in App.tsx and wrapped in `Suspense`.
- The sync-status pill ticks every 15 s via a `setInterval` to keep "Synced 23s ago" current.
- `home-dashboard-stats` is the slowest call (often 400–800 ms cold). Cached locations/weather load instantly from sessionStorage on revisit.
- A `RouteFallback` (centered spinner) shows while the Suspense resolves.

### Linked storage buckets

None directly — child components touch `plant-images`, `doctor-sessions`, `garden-photos`.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

The Dashboard is your "what should I be doing right now?" answer. For a beginner gardener it's the antidote to gardening overwhelm — there's no need to remember when you watered the tomatoes last; the Dashboard tells you that's due today, that frost is coming on Thursday, and that you said you'd water the Acer when the lux fell below 8,000. For an experienced gardener it's a glance dashboard — *what's the weather doing, what's overdue, what is the AI noticing about my patterns, and what slipped*?

If you only open one screen in Rhozly per day, this is it. Everything else is for when you have a specific question or want to plan a project.

### Every flow on this page

#### 1. Daily Brief — the hero greeting

- **What you see:** a wide gradient card with "Good morning, Sarah", today's date, an icon showing the current weather, a one-line "Today: 3 tasks · 18°C · frost expected tonight" headline, and a row of stat chips (overdue / today / golden hour / sunset / frost).
- **What you can do:** tap any chip to jump straight to the relevant context — overdue / today opens the calendar view, weather chip opens the weather tab, golden hour / sunset open the Sun Tracker, frost opens the weather tab. The Zone chip jumps to Home Management. There's a "Got a plant question?" chip that opens Plant Doctor chat with the day's context loaded.
- **Why a gardener cares:** in 5 seconds you know whether today is a doing day, a watching day, or a watering day. Frost chip on a March night could be the difference between losing your seedlings or covering them.
- **Beginner framing:** treat the Daily Brief like a weather forecast for your garden — quick read, then move on.
- **Expert framing:** the stat chips encode the planning info you'd otherwise scrape from four different tools. Use it as a habit anchor at coffee in the morning.

#### 2. Getting Started Checklist (first-run only)

- **What you see:** a green card above the Daily Brief listing 5 steps (take quiz, add location, add a plant, assign it to an area, set a watering reminder) with check marks ticking as you complete them.
- **What you can do:** each step is a one-tap launcher to the right surface.
- **Why a gardener cares:** Rhozly's value increases as you add more context. The checklist front-loads the highest-impact 5 minutes.
- **Disappears:** once all 5 are done OR you dismiss it. Returning users won't see it.

#### 3. Notification Opt-In Card (first-run only)

- Tap "Enable" → browser permission prompt. Once granted you'll get OS-level reminders for due tasks. Tap "Not now" → never shown again.
- **Why it matters:** without notifications, the app only works when you remember to open it.

#### 4. AI Insight Card (Sage / Evergreen only)

- **What you see:** an indigo-purple card with a sparkle icon and a sentence like "You usually water the herb bed every 3 days but it's been 6 — the heat wave probably explains it. Want me to push the next watering forward?"
- **What you can do:** "Got it" dismisses the insight. The expand toggle shows older insights you haven't actioned.
- **Why a gardener cares:** these are surfaced by the pattern engine — your real behaviour over time, not generic advice. The expert framing: read them like a quarterly review, not a prescription.

#### 5. Quiz Prompt Card (until completed)

- An emerald gradient card asking you to take the Garden Quiz. Tap "Start the quiz →" to open it. The dismiss X requires a confirm step ("Hide this for now?") to avoid accidental loss.
- The quiz takes ~2 minutes and personalises plant recommendations + watering frequency defaults.

#### 6. Home Dashboard — Weekly stats + today's tasks

The bulk of the page below the brief. It contains:

- A **week-strip** showing 7 day columns each with a count of pending/completed tasks colour-coded by status (green = done, red = overdue, amber = late-but-done).
- **Today's task list** (filtered to today) reusing the `TaskList` component. Each task can be tapped to mark complete, postponed, photographed, or opened for full detail.
- **Plant count summary** — total species and individual plants in your garden.

#### 7. Sync indicator (top-right of body)

- A small "Synced 23s ago" text that updates every 15 s. Tap pull-to-refresh anywhere on the page to force a re-sync.

#### 8. Sub-tab switcher (Dashboard / Overview / Locations / Calendar / Weather)

- All five are different views of the same Dashboard tab. "Dashboard" is the new [Home view](./17-home-main.md) (the default landing); "Overview" is this page. Selection is persisted in localStorage `rhozly_dashboard_view` and remembered for next session (the persist-restore only runs once on mount, so clicking "Dashboard" from another sub-tab actually returns to the default; a legacy stored `"dashboard"` value deliberately falls through to the new Home default once).
- **Mobile layout (`dashboard-view-switcher`):** on a phone the 80px nav rail leaves too little width for all five labels, so the strip **scrolls horizontally** (`overflow-x-auto scrollbar-none`, buttons `shrink-0 whitespace-nowrap`) with full, readable labels instead of clipping "Weather" off-screen. On `sm+` it fills the width as a segmented control (`sm:flex-1 sm:overflow-visible`).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "Good morning / afternoon / evening, [First name]" | Time-of-day-aware greeting. Falls back to "Gardener" if no first name. |
| Today's date row | UK-format day name + numeric day + month |
| Weather icon | Open-Meteo weather code mapped to an icon |
| "Today: X tasks · YY°C · frost expected tonight" | One-line synthesised summary |
| **Overdue X tasks** chip (amber) | Pending tasks with due_date < today |
| **Today Y tasks** chip (white) | Pending tasks with due_date = today |
| Temperature chip | Current temp from latest weather snapshot |
| Golden hour chip | Sunrise/sunset ± 1h window — best soft light for photos |
| Sunset chip | Today's sunset time (24h) |
| Frost chip | When tonight's min temp < 2°C |
| Zone N chip | USDA hardiness zone — see home settings |
| Microclimate chip | Deep-link to garden layouts where the report lives |
| "Got a plant question?" chip | Opens Plant Doctor chat with today's context |
| Week strip dots | Green ✓ = done today, amber ✓ = late but done, red ✗ = overdue, faint ✕ = missed |
| Plant counts | Species (unique plant types) vs Plants (individual instances) |

### Tier-by-tier experience

| Tier | Differences on Dashboard |
|------|--------------------------|
| Sprout | Head Gardener + AI Insight cards show a compact one-line upgrade teaser. No Plant Doctor chat — both the global chat FAB (RHO-10) and the Daily Brief "Got a plant question?" chip (RHO-11) are hidden for non-AI tiers. Full week-strip + tasks + weather. |
| Botanist | Same as Sprout (Botanist is a higher paid tier without AI add-ons by default). |
| Sage | AssistantCard renders when insights exist; Head Gardener card still shows a compact teaser. Plant Doctor chat available from the "Got a plant question?" chip. |
| Evergreen | Head Gardener + AI Insight cards render fully. |

### New user vs returning user vs power user

- **Brand new user** (just signed up, completed home setup): sees the Getting Started Checklist at the top, an empty week strip, no plants yet. Daily Brief still works — uses location for weather even before plants exist.
- **Returning user** (a few plants, regular tasks): Daily Brief is the dominant content. Checklist disappears. Today's task list is the main interactive area.
- **Power user** (many plants, several locations, integrations wired): more frequent realtime updates, sync indicator ticks more often, multiple location chips in the location sub-tab, alerts more relevant.

### Beta user experience

The amber BetaFeedbackBanner sits above the page. Aside from that, no Dashboard-specific beta differences today.

### Common mistakes / pitfalls

- **Mistaking the sub-tab strip for primary navigation.** The five sub-tabs (Dashboard / Overview / Locations / Calendar / Weather) are all *inside* the Dashboard route — they don't navigate away. Primary nav is on the left sidebar.
- **Looking for this page on plain `/dashboard`.** That now lands on the new Home view — this classic feed is the "Overview" sub-tab, content intact.
- **Believing the Daily Brief is "live".** It refreshes when you visit / pull-to-refresh. The "Synced X ago" indicator tells you how stale it is.
- **Assuming the AI Insight is a directive.** It's a hypothesis from a pattern detector — "Got it" just acknowledges it. You're free to ignore.
- **Dismissing the quiz card thinking it's optional.** It is optional, but the AI's recommendations get measurably better with quiz data. The dismiss flow requires confirm to avoid hiding it forever by accident.

### Recommended workflows

- **Morning coffee, 60 seconds:** Glance Daily Brief → tap "Today's tasks" → tick the watering / pruning that's due → look at frost chip if relevant.
- **Tap an alert chip:** opens the Weather tab with the alert highlighted. Use this when a banner appears.
- **End of day quick review:** open the Dashboard, glance the week-strip — were today's tasks done? If anything's red, tap to reschedule or complete.
- **AI insight check (weekly):** if you're on Sage/Evergreen, glance the AssistantCard once a week. Skip if empty.

### What to do if something looks wrong

- **Stats look stale:** pull down to refresh (the sync indicator shows the last sync time). Or tap the manual refresh icon on the Locations sub-tab.
- **AI Insight references a wrong plant:** tap "Got it" to dismiss. The pattern engine has weights that adjust over time; a single mis-fire isn't worth a bug report.
- **Daily Brief says no weather:** your home doesn't have lat/lng yet. Open Home Management and set the postcode.
- **All counts are zero but you have plants:** RLS/auth boundary. Sign out and back in.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — the new default `/dashboard` landing view; shares the onboarding cards with this page
- [Locations Tab](./02-locations-tab.md)
- [Calendar Tab](./03-calendar-tab.md)
- [Weather Tab](./04-weather-tab.md)
- [Daily Brief Card](./05-daily-brief-card.md)
- [AI Assistant Card](./06-assistant-card.md)
- [Location Page](./07-location-page.md)
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md)
- [Garden Quiz](../01-onboarding/05-garden-quiz.md)
- [Pattern Engine (cross-cutting)](../99-cross-cutting/26-pattern-engine.md)
- [Weather (cross-cutting)](../99-cross-cutting/27-weather.md)
- [Sun Analysis (cross-cutting)](../99-cross-cutting/28-sun-analysis.md)

## Code references for ongoing maintenance

- `src/App.tsx:979–1273` — `/dashboard` route render block
- `src/App.tsx:634–642` — `handleManualRefresh`
- `src/App.tsx:645–650` — `handleHomeDataRealtime`
- `src/App.tsx:653–668` — `handleInventoryRealtime` (lightweight counts-only path)
- `src/components/DailyBriefCard.tsx` — hero card
- `src/components/HomeDashboard.tsx` — weekly stats + today's tasks
- `src/components/AssistantCard.tsx` — AI insights
- `src/components/GettingStartedChecklist.tsx` — 5-step onboarding card
- `src/components/NotificationOptInCard.tsx` — first-run notification permission ask
- `supabase/functions/home-dashboard-stats/index.ts` — main aggregator edge fn
- `supabase/functions/sync-weather/index.ts` — hourly weather sync
- `supabase/functions/analyse-weather/index.ts` — alert generation
- `supabase/functions/pattern-scan/index.ts` + `pattern-evaluate/index.ts` — feeds AssistantCard
- `supabase/functions/refresh-behaviour-summary/index.ts` — keeps personalisation context fresh
- `supabase/migrations/20260527000000_hardiness_zone.sql` — `homes.hardiness_zone`
- `supabase/migrations/20260523000001_homes_climate_zone.sql` — climate context
- `supabase/migrations/20260516000000_add_onboarding_state.sql` — onboarding_state jsonb
