# Home (Main Dashboard)

> The single `/dashboard` view — "how is my garden doing right now?" answered on one screen, rendered in two densities. The old sibling **"Overview"** sub-tab was merged in here (design overhaul Phase 4.2): its full task list and stat wall (now **Garden Snapshot**) live behind the **Detailed** density, while the Head Gardener, AI Insights, and Week Ahead cards render in **both** densities (product call 2026-07-19). The Overview's Daily Brief hero survived the merge only until redesign **Stage 2** (2026-07-20) — `DailyBriefCard` is now **deleted** and ONE hero (`HomeStatusStrip`) serves both densities in two voices. **Since 2026-07-20 ("one responsive home") this is the SOLE home for BOTH phone and desktop** — the phone-only `/quick` launcher home (`QuickAccessHome`) was retired and folded in here (Simple density on phone is the fast glanceable view; its customisable launcher is the `QuickActionsRow` below — same catalogue + pins). Previously phone landed on `/quick`; now `/` redirects both platforms here.

**Route / how to reach it:** `/dashboard` (no `?view=` param, explicit `?view=home`, legacy `?view=dashboard`, legacy `?view=overview`, or any unknown value — **all** fall through to home). It is also the **`/` landing for both phone and desktop**, and the target of the legacy `/quick` redirect. Labelled **"Dashboard"** in the four-tab sub-tab switcher (Dashboard / Locations / Calendar / Weather). The Overview tab no longer exists — see [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md).
**Source files (entry points):**
- `src/components/home/HomeMain.tsx` — the page (lazy-loaded from App.tsx); owns density state and the single `useHomeDashboardStats` mount
- `src/components/home/HomeStatusStrip.tsx` — **the hero for BOTH densities** (redesign Stages 1–2, 2026-07-20): un-boxed display-scale greeting + either the composed status **sentence** (`variant="sentence"`, Simple) or the tabular **console line** (`variant="console"`, Detailed). Same filename + `data-testid="home-status-strip"` (the `dashboard_tour` step-2 anchor), but the old greeting-plus-chip-row is gone
- `src/lib/heroSentence.ts` — pure sentence/segment composers for the hero (clause ladder, frost/rain extractors, sun micro-line; 24 unit tests)
- `src/lib/personaPresets.ts` — Stage 0 persona-posture plumbing (`effectivePersona`, `HOME_PRESETS`, `resolveHomePosture`; 21 unit tests). **Landed but not yet driving composition** — Stage 4's section loop consumes it
- ~~`src/components/DailyBriefCard.tsx`~~ — the old Detailed-density hero — **DELETED in Stage 2 (2026-07-20)**; the console hero replaced it and its facts migrated (see [Daily Brief Card — RETIRED](./05-daily-brief-card.md))
- `src/components/home/GardenSnapshot.tsx` — the old Overview stat wall, relocated (Detailed only; **starts collapsed for everyone** since Stage 2)
- `src/components/home/AttentionRow.tsx` — ranked "needs attention" cards (the dashboard passes `excludeKinds` — Stage 2 one-owner filtering)
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the centrepiece grid (AreaRow carries the sensor/valve/tasks chips)
- `src/components/home/QuickActionsRow.tsx` — launcher-pin tiles + the featured Garden Walk tile (Stage 2 — the standalone banner folded in via the `walkPlantCount` prop)
- `src/components/manager/HeadGardenerCard.tsx` + `src/components/AssistantCard.tsx` — AI cards (both densities)
- `src/hooks/useHomeOverview.ts` — the `home-overview` edge-function fetch
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — the telemetry aggregate
- `src/App.tsx` — view-param parsing (~line 511), localStorage persistence (~line 522), four-tab switcher (~line 1672), single-slot onboarding + home render branch (~line 1705)

---

## Quick Summary

One page, two densities — **Simple** (guidance-first, the default) and **Detailed** (telemetry-first, the default for `persona === "experienced"`; localStorage `rhozly:home:density` once toggled). Both share a spine: **ONE hero** (`HomeStatusStrip` — since redesign Stage 2 it serves both densities: Simple gets the **sentence voice**, Detailed the **console voice**), attention row, Garden Brain brief, adaptive-care card, the **Head Gardener** / **AI Insight** / Evergreen-gated **Week Ahead** cards, the location-by-location garden grid, quick actions (whose featured first tile is now the **Garden Walk** — the standalone banner folded in, Stage 2), and a task list. The sentence voice (Stage 1): a date-eyebrow micro-label, a `text-3xl/4xl` display greeting, ONE composed status sentence that IS the summary, a sun micro-line, and ≤2 chips — the old chip row is gone. The console voice (Stage 2): compact greeting + a tabular deep-linking segment line ("1/16 today · 2 overdue · 14° light rain · golden hour 20:16") + the migrated ask-AI chip. **`DailyBriefCard` is deleted** — the console hero replaced it (one greeting, one voice per density; never two heroes). Simple closes with a compact today's-tasks section plus Seasonal Picks; Detailed replaces the compact list with the **full TaskList** (Pending/Completed tabs) and appends the collapsible **Garden Snapshot** stat wall (**collapsed by default for everyone** since Stage 2). The **AttentionRow is kind-filtered here** (`excludeKinds=["overdue_tasks","weather_alert"]` — the hero owns overdue, the global WeatherAlertBanner owns alerts; telemetry + harvest kinds survive). App.tsx still owns the **single-slot** onboarding/promo cascade but now passes it into HomeMain as the `promoSlot` prop, rendered **below the hero** in both densities (the greeting always leads). The grid renders instantly from client-held state; the **`home-overview`** edge function layers live telemetry on top and soft-fails — the page never blocks on it. A **single `useHomeDashboardStats` mount** in HomeMain feeds both the today summary and the Garden Snapshot — never add a second consumer (the edge fn is uncached).

---

## Role 1 — Technical Reference

### Component graph

- `src/App.tsx` — `/dashboard` route; renders the **four-tab** switcher (`data-testid="dashboard-view-switcher"`: Dashboard / Locations / Calendar / Weather — **slimmed in redesign Stage 1** from a full-width segmented bar to a compact inline pill row, `px-3.5 py-1.5 min-h-[36px] rounded-full`; same DOM, testid, and `role=button` selectors), the **conditional** sync-status pill (`dashboard-sync-status` — renders ONLY when never-synced or stale > 5 min, amber-tinted; the permanent "SYNCED JUST NOW" chrome is gone), builds the single-slot onboarding cascade, and the `home` branch
  - **Single-slot onboarding (Phase 4.2; slot moved Stage 1)** — at most ONE promo card, now passed to HomeMain as its `promoSlot` prop and rendered **below the hero** in both densities (previously above the page). Priority order unchanged:
    1. `GettingStartedChecklist` (`src/components/GettingStartedChecklist.tsx`) — decides its own visibility and reports it via the `onVisibilityChange` prop (`setChecklistSlotVisible`; defaults `true` so nothing below flashes before its queries resolve). See [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md).
    2. Quiz Prompt card (inline in App.tsx; moved here from the old Overview branch) — headline **"Set up your Garden Quiz"**, CTA **"Start the quiz →"** (→ `/profile`); dismiss X opens a confirm row with `quiz-prompt-snooze-14d` / `quiz-prompt-dont-ask-again`, persisted via `onboarding_state.quiz_prompt_snoozed_until`. See [Garden Quiz](../01-onboarding/05-garden-quiz.md).
    3. `NotificationOptInCard` — localStorage-only dismissal. See [Notification Opt-In](../01-onboarding/07-notification-opt-in.md).
    4. `InstallPwaPrompt` — localStorage-only, `beforeinstallprompt`-gated. See [PWA Install Prompt](../01-onboarding/08-pwa-install.md).
  - `HomeMain` (`src/components/home/HomeMain.tsx`) — the page, inside `Suspense` (lazy chunk); calls `useHomeOverview(homeId)` (→ `telemetryByArea` map) and `useHomeDashboardStats(homeId)` (→ today summary + Garden Snapshot)

**Card order — Simple density** (`data-testid="home-main"`):

1. Hero row: `HomeStatusStrip` `variant="sentence"` (**the Porch hero**, un-boxed — no card surface; type scale is the eye-catcher): uppercase date eyebrow → `text-3xl sm:text-4xl font-display` greeting → the composed status sentence (`hero-sentence`) → sun micro-line ("Golden hour 19:42 · sunset 21:32", SunCalc from `homeLat`/`homeLng`, 60s visibility-paused tick, hides after sunset) → ≤2 chips: **"Plan my day"** (`hero-plan-day` → `?view=calendar`) + the weather temp chip (`hero-weather-chip` → `?view=weather`). Plus the density toggle (`home-density-toggle`, buttons `home-density-simple` / `home-density-detailed`). **The old chip-row testids are gone:** `home-strip-weather` / `home-strip-tasks` / `home-strip-tasks-headline` / `home-strip-pending` / `home-strip-skipped` / `home-strip-postponed` / `home-strip-overdue` / `home-strip-frost` no longer exist (no tests referenced them)
2. `promoSlot` — the single-slot onboarding cascade from App.tsx (checklist → quiz → notif → PWA; all card testids unchanged), below the hero so the greeting always leads
3. `AttentionRow` — max-4 ranked "needs attention" cards from `home-overview`; `null` when calm. **The dashboard passes `excludeKinds={["overdue_tasks","weather_alert"]}`** (Stage 2 one-owner map: the hero owns overdue, the global [WeatherAlertBanner](./08-weather-alert-banner.md) owns alerts) — only the telemetry + harvest kinds (`automation_failed` / `low_battery` / `soil_dry` / `harvest_closing`) surface here
4. `GardenBrainBriefCard` — "Your daily brief" (top 3 items in simple density); self-hides pre-cron. See [Garden Brain](../99-cross-cutting/39-garden-brain.md)
5. `AdaptiveCareCard` — Garden Brain adaptive-care proposals; self-hides when the home has no rows
6. `HeadGardenerCard` (`dashboard-head-gardener-card` wrapper) + `AssistantCard userId showUpgradeWhenLocked` (`dashboard-assistant-card` wrapper) — both only when `userId`; both densities (product call 2026-07-19)
7. `GardenOverviewGrid` (one `LocationOverviewCard` per location, one `AreaRow` per area) — or the empty-garden setup card (`home-empty-garden`, 3 CTAs) when the home has no locations
8. `QuickActionsRow` — **the featured full-width Garden Walk tile first** (`dash-garden-walk`, renders only when `walkPlantCount >= 5` from `stats.garden.totalPlants`; navigates to `/walk` with `state:{ from: "/dashboard" }` — Stage 2 folded the standalone banner in here, same testid + state contract), then up to 6 launcher-pin tiles + Customise
9. Compact today's-tasks section (`home-todays-tasks`) — `TaskList` with `compact` + `targetDate` = today; "See all" (`home-tasks-see-all`) → `/dashboard?view=calendar`
10. `WeekAheadPreview` inside `<FeatureGate feature="ai_insights" fallback={null}>` — Evergreen-only (RHO-9); both densities
11. `SeasonalPicksCard` (`variant="dashboard"`)

**Hero sentence composition** (`src/lib/heroSentence.ts`, pure + unit-tested): `composeHeroSentence` picks ONE clause on a strict ladder — **frost tonight (`extractFrostMin`, threshold ≤ 3 °C) > severe weather alert (warning/critical only; `info` never claims the sentence; short labels derived from `weather_alerts.type` since rows carry no title) > overdue > rain today (`extractRainToday`, ≥ `RAIN_MENTION_MM` = 1 mm — pairs with remaining tasks: "3 tasks left before today's rain") > today's tasks > praise/quiet**. The global WeatherAlertBanner remains the alert's canonical dismissible owner — the sentence may *lead* with a severe alert but never replaces the banner (escalation, not ownership).

**Console voice (Stage 2 — the Detailed hero):** `variant="console"` renders the date eyebrow, a compact greeting (`text-xl/2xl`), and the tabular segment line (`hero-console-line`, via `composeConsoleSegments` — "1/16 today · 2 overdue · 14° light rain · golden hour 20:16"). Segments (`hero-seg-{id}`, tabular-nums): `tasks` ("X/Y today" or "clear today" → `?view=calendar`) · `overdue` (only when > 0, danger tone → `?view=calendar`) · `weather` (current temp + condition → `?view=weather`) · `frost` (only when tonight's min ≤ 3 °C, danger tone → `?view=weather`) · `sun` ("golden hour HH:MM" before golden hour, "sunset HH:MM" until sunset; non-linking). Zero-value segments drop. The console voice carries the **migrated ask-AI chip** from the retired DailyBriefCard — **same `data-testid="daily-brief-ask-ai"`, same `aiEnabled` gate (RHO-11)** — which sets Plant Doctor page context (today/overdue counts, weather, hardiness zone) via `usePlantDoctor` and opens the chat. No sun micro-line and no "Plan my day"/weather chips in this voice — sun and weather are segments; `hero-plan-day` is sentence-voice only. **Fact migration (Stage 2):** sun/golden-hour line → the sentence hero's micro-line + the console `sun` segment (both SunCalc); ask-AI chip → the console hero; Plan-day → `hero-plan-day` (sentence voice); the Zone/Microclimate chips were **retired** — their facts live at `/home-management` and `/garden-layout` (testids `daily-brief-zone-chip` / `daily-brief-microclimate-chip` no longer exist; no tests referenced them). Deleting DailyBriefCard also resolved the `daily-brief-card` testid collision (it and `GardenBrainBriefCard` both claimed it — the survivor is GardenBrainBriefCard's, until its Stage-3 rename) and removed the latent `alerts[0].title`-always-`undefined` footer-hint bug.

**Card order — Detailed density:**

Detailed density is the desktop "studio" (Phase 6c). On **`xl+` (≥1280px)** HomeMain renders a **two-column** layout — a `xl:grid xl:grid-cols-12` with a `xl:col-span-8` **primary** column (the daily-action flow) and a `xl:col-span-4` **insight rail** (`<aside>`, the glanceable secondary cards). Below `xl` the two columns collapse back into a single stack (primary blocks, then rail blocks). The blocks are extracted to named consts in HomeMain so the same elements feed both the simple single-column path and the detailed two-column path — every `data-testid` is unchanged.

*Primary column (left):*
1. Hero row: `HomeStatusStrip` `variant="console"` (**the Workbench hero** — Stage 2; the `DailyBriefCard` it replaced is deleted) + the density toggle. Same wrapper testid `home-status-strip`; the console line + ask-AI chip as described above — one hero, one greeting, whichever the density
2. `promoSlot` — the same single-slot cascade, below the hero here too
3. `AttentionRow` — same `excludeKinds` filter as Simple (telemetry + harvest kinds only)
4. `GardenBrainBriefCard` (all items + reasons in detailed density)
5. `GardenOverviewGrid` (or `home-empty-garden`) in the `home-garden-section` wrapper
6. `QuickActionsRow` — featured Garden Walk tile first (`dash-garden-walk` — **both** densities), then the launcher tiles; the standalone walk banner block is gone
7. **Full `TaskList`** in a `data-testid="dashboard-task-list"` wrapper div — the whole task-management surface (Daily Tasks heading, Pending/Completed tabs), the old Overview TasksPanel role

*Insight rail (right, `<aside>`):*
1. `AdaptiveCareCard`
2. `HeadGardenerCard` in a `data-testid="dashboard-head-gardener-card"` wrapper div (only when `userId`) — self-gates (Evergreen; compact upsell otherwise). See [Head Gardener](./16-head-gardener.md)
3. `AssistantCard userId showUpgradeWhenLocked` in a `data-testid="dashboard-assistant-card"` wrapper div (only when `userId`) — see [AI Assistant Card](./06-assistant-card.md)
4. `WeekAheadPreview` inside `<FeatureGate feature="ai_insights" fallback={null}>` — Evergreen-only (RHO-9)
5. `GardenSnapshot` — the collapsible "This Week at a Glance" stat wall (below); **starts collapsed**

### GardenSnapshot (`src/components/home/GardenSnapshot.tsx`)

The old Overview stat wall relocated. **Pure presentation** — HomeMain owns `useHomeDashboardStats` and threads `stats / loading / error / refresh / weekStart / weekEnd` down, so mounting it never double-fetches.

- **Header:** "This Week at a Glance" + week range + `dash-refresh` (re-invokes the fetch; spinner while loading).
- **Collapse toggle** (`dash-snapshot-toggle`, `aria-expanded`): localStorage `rhozly:dashboard:snapshot-open`; **default COLLAPSED for everyone** (redesign Stage 2 — deep stats are the snapshot's owned fact family, one tap away; an open stat wall re-duplicated numbers the hero + task list already carry). The persona-follows-open effect was removed; persisted **only on user toggle** (never on mount), and the user's explicit choice always wins on later visits.
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
| `weather` | `any` | App's extracted current weather | Hero weather chip (sentence voice) / `weather` console segment |
| `rawWeather` | `any` | Latest `weather_snapshots.data` JSONB | Frost derivation |
| `locations` | `OverviewLocation[]` | App's `locations` state | The grid |
| `locationTaskCounts` | `Record<string, number>` | App's per-location **remaining-today** counts (ghost-aware, `buildLocationTaskCounts`) | Per-card task chip + summed for the strip / brief |
| `overdueTaskCount` | `number` | App's home-scoped overdue count (RHO-3) | Hero overdue clause / `overdue` console segment |
| `alerts` | `any[]` | Active `weather_alerts` | Hero severe-alert clause (warning/critical may lead the sentence) |
| `homeLat` / `homeLng` | `number \| null` | App's `homeLatLng` | Hero sun micro-line (sentence voice) / `sun` console segment (both SunCalc) |
| `hardinessZone` | `number \| null` | `homes.hardiness_zone` | Threaded into the hero's ask-AI page context (the DailyBriefCard zone chip is retired — the fact lives at `/home-management`) |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | SeasonalPicksCard AI branch + the hero's ask-AI chip (RHO-11) |
| `isPremium` | `boolean` | `profile.enable_perenual` | SeasonalPicksCard |
| `availabilityCtx` | `QuickLauncherAvailabilityCtx` | Built inline in App.tsx | Filters launcher tiles via `resolvePins` |
| `promoSlot` | `React.ReactNode` (optional) | App.tsx — the single-slot onboarding cascade | Rendered below the hero in both densities (redesign Stage 1); App keeps ownership of the cascade + eligibility flags |

### State (local)

- `storedDensity` (`useState`, init-only) — synchronous read of localStorage `rhozly:home:density` at mount.
- `densityOverride` (`"simple" | "detailed" | null`) — the user's explicit choice; seeded from `storedDensity` when valid. When `null` the effective density follows the persona (`persona === "experienced"` → `"detailed"`, everything else — including `null` while `usePersona()` is still loading — → `"simple"`).
- Density is **persisted only on user toggle** (`setDensity` writes localStorage) — never on first render, so the persona default isn't frozen before `usePersona()` resolves (the Garden Snapshot preference lesson).
- App.tsx holds `checklistSlotVisible` (default `true`) — the single-slot gate the checklist reports into via `onVisibilityChange`.

### Persona-preset plumbing (Stage 0 — landed, not yet driving composition)

`src/lib/personaPresets.ts` shipped ahead of the Stage 4 section loop:

- `effectivePersona(persona)` — **the canonical null⇒new collapse.** Don't re-derive with ad-hoc `persona !== "experienced"` checks in new code.
- `HomePosture = "porch" | "workbench"` + `HOME_PRESETS` registry — per-posture `{sectionOrder, variants, snapshotOpen}` declarative recipes, consumed by Stage 4's single section loop (until then the two-density card orders above remain the rendered truth).
- `readStoredPosture()` / `storePosture()` — localStorage key **`rhozly:home:preset`**, with a legacy alias read of `rhozly:home:density` (`"detailed"` → workbench, `"simple"` → porch) so pre-redesign users and density-seeding e2e specs carry over.
- `resolveHomePosture(persona, stored)` — resolution ladder: explicit override > legacy density alias > persona default.

**Posture-flash fix (Stage 0):** App.tsx's profile fetch now includes the `persona` column and calls `primePersona(fromProfile)` (`src/hooks/usePersona.ts`) to prime the module cache **before any consumer mounts** — every consumer's first render sees the real persona, killing the porch/workbench layout-flash race. The offline cached-profile boot path primes too (`src/lib/profileCache.ts` `CachedProfile` gained `persona`). And `PersonaSetting.tsx`'s save now calls `notifyPersonaChanged(next)` so persona flips propagate live to every consumer (previously dead until reload). E2E seeds (`supabase/seeds/00_bootstrap.sql`) now set `persona = NULL` explicitly so reseeds reset any persona leaked by specs.

### Data flow — read paths

- **`useHomeDashboardStats(homeId)`** — **mounted once, in HomeMain, for BOTH densities.** Feeds (a) the "X of Y done today" breakdown via `buildTodaySummary` (`src/lib/todaySummary.ts`) — **pending** from the ghost-aware client `locationTaskCounts` sum, **done** from the server's completion-aware `tasks.doneToday` (`computeDoneToday` — a task counts if completed today, incl. overdue/harvest cleared today, or due today and done), **skipped/postponed** from the server `dayStrip` today bucket; (b) `totalPlants` for the walk-launcher gate; (c) the whole GardenSnapshot in detailed density. Soft-fails — null stats still render the strip's pending count. Don't add second consumers: the `home-dashboard-stats` edge fn is uncached.
- **`useHomeOverview(homeId)`** (`src/hooks/useHomeOverview.ts`) — one `home-overview` invoke on mount / home switch (`today` = client-local date). Generation-guarded; **soft-fails** (grid renders without telemetry chips, attention row stays hidden). Returns `{ locations[], attention[] }`; flattened into the `telemetryByArea` map.
- **Homes query (App.tsx `fetchDashboardData`):** `supabase.from("homes").select("*, weather_snapshots(data, updated_at), locations(*, areas(id, name), inventory_items(id, status, area_id, growth_state, plant_name))")` — the grid groups plants by area client-side. Fires on mount, pull-to-refresh, realtime events, revisit. Caching: the dashboard sessionStorage/localStorage snapshot pattern — see [Caching](../99-cross-cutting/14-caching.md).
- **Inventory realtime refetch (App.tsx `handleInventoryRealtime`)** — carries `area_id, growth_state, plant_name` so a realtime refresh doesn't strip the grid's grouping data.
- **`useQuickLauncherPins(userId)`** — localStorage read + background revalidate. See [Quick Access Home](./09-quick-access-home.md).
- **`usePersona()`** — module-cached persona; drives the density default, quick-action defaults, and the snapshot-open default. Since Stage 0 the cache is **primed synchronously by App.tsx's profile fetch** (`primePersona` — the profile select now includes `persona`; the offline cached-profile boot primes too), so the hook's own `user_profiles.select("persona")` read is a first-boot fallback rather than the normal path.
- **`TaskList`**, **`SeasonalPicksCard`**, **`HeadGardenerCard`**, **`AssistantCard`**, **`WeekAheadPreview`**, **`GardenBrainBriefCard`**, **`AdaptiveCareCard`** make their own reads exactly as documented on their own surfaces. (`HomeStatusStrip` is props-only — no fetches.)

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
| `sync-weather` (hourly) | Hero weather chip / console weather + frost segments, snapshot weather tiles (`weather_snapshots` / `weather_alerts`) |
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
| No weather yet | The hero's weather chip / console weather segment simply doesn't render. |
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

`dashboard_tour` (`src/onboarding/flowRegistry.ts`) targets the merged home in its default Simple density: `dashboard-view-switcher` ("Four views in one"), `home-status-strip`, `home-garden-section`, `home-quick-actions`, `seasonal-picks-card`, `home-todays-tasks`. **Step 2 copy was rewritten for the Stage-1 hero** — "Your day in one sentence" describes the composed sentence as the garden's summary plus the "Plan my day" chip and weather chip (the anchor testid `home-status-strip` is unchanged, which is why the hero rewrite kept the filename + testid).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the front door — and now the *only* dashboard. The old two-tab split (a "Home" grid view and a separate "Overview" stats feed) is gone: one page does both jobs, at the depth you choose. Open the app and in one glance you get the weather, the day's workload, anything overdue, a frost warning if one's coming, and a card for every location showing every area and the state of every plant in it.

For Sarah, the newer gardener, **Simple** is calm: a friendly greeting strip, a small set of chips, coloured dots that say "your plants are at these stages", quick actions biased towards learning, a short today's-tasks list and the Seasonal Picks card. If she hasn't set anything up yet, the page becomes a three-step setup card rather than an empty void.

For Marcus, the experienced gardener, **Detailed** (the default once your persona says "experienced") is the whole operations room on one scroll: the **console hero** — one terse line with the whole day's numbers, every segment tappable — the Head Gardener and AI Insight cards, live sensor/valve telemetry on every area row, the complete task list with Pending/Completed tabs, the Week Ahead preview, and the collapsible **Garden Snapshot** — the week's full stat wall, decluttered (zero-value tiles hide themselves) with a dot-based seven-day strip, one tap away behind its toggle.

Nothing was removed in the merge — everything the Overview tab showed lives here, behind the Detailed toggle.

### Every flow on this page

#### 1. The hero — one greeting, two voices

- **Simple (the sentence voice):** a small uppercase date line, a big warm "Good morning, Vinny", then **one sentence that IS the day's summary**: the thing that matters most right now, and only that. Frost tonight beats everything ("Frost tonight at 2° — cover anything tender before dark"); then a severe weather warning; then overdue catch-up; then rain ("3 tasks left before today's rain"); then plain progress ("3 of 8 tasks left today"); then praise ("All 5 tasks done — lovely work") or quiet ("Nothing on the list — enjoy the garden"). Beneath it, a faint sun line ("Golden hour 19:42 · sunset 21:32") and at most two chips: **Plan my day** (→ Calendar) and the current weather (→ Weather tab). No chip ever restates a number the sentence already said. The old row of seven-ish stat chips is gone — the Calendar owns the full pending/skipped/postponed breakdown.
- **Detailed (the console voice):** the same greeting, compact, followed by **one terse tabular line** — "1/16 today · 2 overdue · 14° light rain · golden hour 20:16". Every number is a segment you can tap straight through: tasks and overdue open the Calendar, weather and frost open the Weather tab; the golden-hour/sunset segment is a read-only clock. Zero-value segments simply don't appear. The "Ask AI" chip sits at the end of the line — the same "Got a plant question?" entry the old Daily Brief card carried, opening the Plant Doctor chat with today's context loaded (Sage/Evergreen only).
- You never see both — they're the same job at two depths. The old **Daily Brief card is retired** (Stage 2): its sun facts live in the hero, its ask-AI chip moved onto the console line, and the Zone / Microclimate chips' facts live on their own pages — Home Management and Garden Layouts. See [Daily Brief Card — RETIRED](./05-daily-brief-card.md) for the full map.

#### 2. Simple / Detailed toggle (top-right)

Two small icon buttons (list = Simple, rows = Detailed). Your choice is remembered on this device; until you ever touch it, the page follows your quiz persona — experienced gardeners start Detailed, everyone else Simple.

#### 3. Needs attention row (both densities; hidden when calm)

Up to four ranked cards — **on this page, telemetry and harvest only**: amber = failed automation, orange = battery under 25%, yellow = dry soil, lime = harvest window closing. Tap to deep-link. No row = nothing needs you. Since Stage 2 the overdue and weather-alert cards **don't appear here** — the hero already tells you about overdue, and the weather alert banner at the top of the app is the one place alerts live (one fact, one owner — no more reading "2 overdue" four times on one screen).

#### 4. Daily brief & adaptive care (Garden Brain, both densities)

"Your daily brief" ranks the day's priorities (top 3 in Simple; everything + reasons in Detailed) with a good-news line and 👍/👎. The adaptive-care card proposes watering-blueprint adjustments from sensor evidence. Both self-hide when there's nothing to say.

#### 5. AI cards (Detailed only)

- **Head Gardener** — the Evergreen estate-manager card (compact upgrade teaser below Evergreen).
- **AI Insight** — the pattern engine's read on your behaviour; on this page locked tiers see a one-line upgrade teaser rather than nothing.

#### 6. Garden Overview grid — one card per location

One card per location: indoors/outdoors icon, name, "Outdoors · 3 areas · 12 plants", tasks-today chip, hazard banner, then one row per area with up to 5 growth-state dots (`+N` overflow), plus — when hardware is connected — soil sensor, valve, and per-area task chips. Tap through to the Location drill-in. Areas with a sensor grey their chip when the reading is over 24 h old; a valve only claims "Watering" while its own countdown is genuinely live.

#### 7. Quick actions — with the Garden Walk up front

Once you have **5 or more plants**, the Quick actions section leads with a full-width **"Start a Garden Walk"** tile (Stage 2 folded the old standalone banner in here) — a guided check-in on every plant (snap, note, or tick as you go), returning here when you finish. Below it, up to 6 tiles — your saved Quick Launcher pins, or persona-aware defaults. Customise opens the picker at `/gardener?section=quick-launcher`; the changes apply here (this is now the only surface the launcher lives on since the `/quick` home was retired).

#### 8. Tasks — compact vs full

- **Simple:** a compact "Today's tasks" list; "See all" opens the Calendar sub-tab.
- **Detailed:** the **full task list** — Daily Tasks heading, Pending/Completed tabs, every action (complete, postpone, photo, detail). The whole task-management surface without leaving the dashboard.

#### 9. Week Ahead (both densities, Evergreen only)

A sneak-peek card into the weekly overview page. Hidden entirely on other tiers. Since Stage 2 it leads with **its own fact family** — the week's sow / harvest / prune windows — rather than repeating task counts or weather alerts the hero and banner already carry.

#### 10. Garden Snapshot (Detailed only)

"This Week at a Glance" — the old Overview stat wall behind a collapse toggle (**collapsed by default for everyone** since Stage 2 — the deep numbers are one tap away; open it once and your preference sticks). Inside: task tiles (total, completed, overdue, pending, auto-done, streak), the seven-day strip — now **stacked coloured dots** per day (red overdue, orange late, green on time, neutral pending; hover or tap a day for exact pill counts; tap through to that day's calendar) — garden tiles (plants, harvests, pruning), weather, automations and activity tiles, category chips, and the per-member breakdown. **Zero-value tiles hide themselves** (and empty sections drop their headers) so the wall only shows numbers that mean something — only Total Tasks and Active Plants always render. Refresh re-pulls the week.

#### 11. Seasonal Picks (Simple only)

The weekly "what can I grow right now?" card. Detailed hides it to keep the page telemetry-first.

#### 12. First-run cards — one at a time, below the greeting

At most **one** promo card ever shows — and since the Stage-1 redesign it sits **just below the hero** rather than above the page, so your greeting is always the first thing you see. Priority order unchanged: Getting Started checklist → Garden Quiz prompt ("Set up your Garden Quiz" — snooze 2 weeks or don't-ask-again) → notification opt-in → PWA install. Dismissing one lets the next eligible card claim the slot on a later visit. See the [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) and [Garden Quiz](../01-onboarding/05-garden-quiz.md) references for each card's own rules.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "Good morning / afternoon / evening, [name]" | Time-of-day greeting (both heroes) |
| Date eyebrow (Simple) | Small uppercase "SUNDAY 20 JULY" micro-label above the greeting |
| The hero sentence (Simple) | One composed status sentence — highest-priority clause wins: frost tonight (≤ 3 °C) > severe weather alert > overdue > rain today (≥ 1 mm, pairs with tasks left) > tasks left ("X of Y done today" logic: done = completed today incl. overdue/harvest cleared today, or due today and done; total is ghost-aware) > all-done praise / quiet |
| Sun micro-line (Simple) | "Golden hour 19:42 · sunset 21:32" — refreshes each minute (pauses when the tab is hidden), hides after sunset or without home coordinates |
| "Plan my day" chip (Simple) | Opens the Calendar sub-tab |
| Weather chip (Simple) | Current temp + condition from the latest weather snapshot → Weather sub-tab |
| The console line (Detailed) | "1/16 today · 2 overdue · 14° light rain · golden hour 20:16" — tap-through segments: done/total tasks and overdue → Calendar, current weather and frost (tonight ≤ 3 °C) → Weather tab, golden hour/sunset read-only; zero-value segments drop |
| "Ask AI" (Detailed) | The migrated "Got a plant question?" entry — opens the Plant Doctor chat with today's context (Sage/Evergreen only) |
| "Needs attention" cards | Ranked triage, max 4 — on the dashboard, telemetry + harvest only: failed automation → low battery → dry soil → closing harvest (overdue and weather-alert cards are owned by the hero and the alert banner); hidden when calm |
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

- **Brand new user** (no locations): the greeting + "Nothing on the list — enjoy the garden." sentence, one onboarding card (the checklist) just below it, then the 3-CTA setup card. No snapshot, no walk launcher.
- **Returning user:** read the sentence, scan the dots, tick off today's tasks from the compact list.
- **Power user:** Detailed by default — the console hero line, AI cards, telemetry on every row, full task list, the snapshot one tap away. The 2-column grid, 5-dot cap and zero-tile hiding keep even large estates on one scrollable screen.

### Beta user experience

No differences (the BetaFeedbackBanner renders app-wide above the page as usual).

### Common mistakes / pitfalls

- **"Where did the Overview tab go?"** Merged into this page (Phase 4.2). Flip the density toggle to **Detailed** — the console hero, AI cards, full task list, Week Ahead and the stat wall are all there. Old `?view=overview` links land here.
- **"Where did the Daily Brief card go?"** Retired (Stage 2). Nothing was lost: the day's numbers are the hero itself (sentence or console line), "Ask AI" sits on the console line, golden hour/sunset live in the hero, and the Zone / Microclimate facts are on Home Management and Garden Layouts.
- **"The attention row stopped showing my overdue tasks / weather alert."** By design — the hero tells you about overdue and the alert banner owns weather. The row is now purely telemetry + harvest.
- **Assuming grey dots mean unhealthy.** Grey means *not planted yet*, not sick.
- **Expecting the dots to show all plants.** Only 5 render per row; `+N` covers the rest.
- **"My stats disappeared."** Zero-value snapshot tiles hide themselves — a missing "Overdue" tile means zero overdue, which is good news. Only Total Tasks and Active Plants always render.
- **"The snapshot is collapsed / missing."** It's Detailed-only and starts collapsed for everyone (Stage 2) — tap "This Week at a Glance" to open it; your toggle sticks. It renders nothing for an empty garden.
- **Toggling density and expecting it to sync across devices.** Per-device preference (localStorage), not a profile setting.
- **Reading a grey soil chip as a live value.** Grey = sensor silent for over 24 hours.
- **Panicking at a missing attention row.** Hidden when calm, not broken.
- **Seeing two promo cards stacked.** Never happens — the slot shows exactly one; the rest queue behind it.
- **Looking for the walk launcher with 3 plants.** It appears at 5+.

### Recommended workflows

- **Morning glance (30 s, Simple):** hero sentence → attention row → scan the grid → tick today's tasks.
- **Estate sweep (Detailed):** console line (tap any segment that's wrong) → AI cards → telemetry rows → full task list → open the snapshot for the week's shape.
- **Weekly review:** open the snapshot, read the carried-over line and the day strip, tap any red-dotted day through to its calendar.
- **Making the page yours:** set the density toggle once, collapse or open the snapshot once, customise the quick actions once — all three stick.

### What to do if something looks wrong

- **Counts or dots look stale:** pull to refresh. An amber sync pill appears above the page only when data really is stale (over 5 minutes) or has never synced — no pill means you're current.
- **A plant is missing from its area's dots:** check the "Not in an area yet" row.
- **The page keeps opening in the wrong density:** a stored toggle wins over the persona default — toggle it back.
- **The snapshot shows an error card:** tap Retry (the stats fetch failed; the rest of the page is unaffected).
- **Sensor/valve chips vanished:** the telemetry call soft-failed this visit — reload; if persistent, check the device on Integrations.
- **An old `?view=overview` bookmark "doesn't work":** it works — it lands here by design; switch to Detailed for the old content.

---

## Related reference files

- [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md) — where the merged-away Overview tab's pieces went
- [Daily Brief Card — RETIRED](./05-daily-brief-card.md) — the old Detailed-density hero, deleted in Stage 2; its stub maps where each fact migrated
- [Weather Alert Banner](./08-weather-alert-banner.md) — the ONE alert owner on this page (the AttentionRow `weather_alert` kind is suppressed here)
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

- `src/components/home/HomeMain.tsx` — page entry; density state, both density card orders, the single `useHomeDashboardStats` mount, `telemetryByArea` threading, empty-garden card, the `excludeKinds` pass to AttentionRow, `walkPlantCount` pass to QuickActionsRow
- `src/components/home/GardenSnapshot.tsx` — collapse toggle (collapsed default — Stage 2), zero-tile hiding (`isZeroValue` / `visibleTiles`), dot-based day strip (`DOTS_PER_BUCKET_CAP`), DayLegend
- `src/components/manager/HeadGardenerCard.tsx` / `src/components/AssistantCard.tsx` — AI cards (both densities)
- `src/components/shared/WeekAheadPreview.tsx` + `src/components/shared/FeatureGate.tsx` — the gated week-ahead card (`describeWeekChips` stripped of task-count + weather-alert chips in Stage 2)
- `src/components/home/HomeStatusStrip.tsx` — the hero: `sentence` + `console` variants, 60s visibility-paused minute tick, SunCalc sun line, "Plan my day" / weather chips (sentence), `hero-console-line` / `hero-seg-{id}` segments + the migrated `daily-brief-ask-ai` chip (console)
- `src/lib/heroSentence.ts` — `composeHeroSentence` (clause ladder), `composeConsoleSegments`, `extractFrostMin` (≤ 3 °C) / `extractRainToday` (≥ 1 mm), `formatSunMicroLine`, `timeOfDayGreeting` (unit tests `tests/unit/lib/heroSentence.test.ts`)
- `src/lib/personaPresets.ts` — `effectivePersona` null⇒new collapse, `HOME_PRESETS`, `readStoredPosture`/`storePosture` (`rhozly:home:preset` + legacy `rhozly:home:density` alias), `resolveHomePosture` (unit tests `tests/unit/lib/personaPresets.test.ts`)
- `src/components/home/AttentionRow.tsx` — kind → icon/colour map, deep-link routing, the `excludeKinds` prop (Stage 2 — other consumers of the attention payload are untouched)
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the grid + `SensorChip` / `ValveChip` / tasks chip
- `src/components/home/GardenBrainBriefCard.tsx` / `AdaptiveCareCard.tsx` — Garden Brain cards
- `src/components/home/QuickActionsRow.tsx` — pins → tiles + the featured Garden Walk tile (`walkPlantCount` prop, `dash-garden-walk`)
- `src/components/TaskList.tsx` — compact (Simple) and full (Detailed) variants
- `src/hooks/useHomeDashboardStats.ts` / `src/lib/todaySummary.ts` — the shared stats mount + today summary
- `src/hooks/useHomeOverview.ts` — generation-guarded, soft-failing telemetry fetch
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — telemetry aggregate (Deno tests `supabase/tests/homeOverview.test.ts`)
- `supabase/functions/home-dashboard-stats/index.ts` + `supabase/functions/_shared/dashboardStats.ts` — stat semantics (Deno tests `supabase/tests/dashboardStats.test.ts`)
- `src/App.tsx:~511` — `DashboardView` parsing (`home | locations | calendar | weather`; legacy `dashboard`/`overview` → `home`)
- `src/App.tsx:~522` — `rhozly_dashboard_view` persistence + legacy fall-through
- `src/App.tsx:~1740` — slimmed four-tab switcher + conditional sync pill; `~1780` — `promoSlot` cascade build + HomeMain mount
- `src/onboarding/flowRegistry.ts` — `dashboard_tour` (home anchors; step 2 "Your day in one sentence")
- `src/lib/quickLauncherCatalogue.ts` / `src/lib/quickLauncherPrefs.ts` / `src/hooks/usePersona.ts` (`primePersona` / `notifyPersonaChanged`) / `src/lib/profileCache.ts` (`CachedProfile.persona`)
- `tests/e2e/specs/home-main.spec.ts` + `tests/e2e/pages/HomeMainPage.ts` — HOME-001..008 (HOME-001 asserts 4 tabs; HOME-004 asserts `?view=overview` falls through to `home-main`)
- `tests/e2e/pages/DashboardPage.ts` — `goto()` seeds `rhozly:home:density = detailed` then visits plain `/dashboard` (classic-content specs ride on that)
- `docs/plans/new-home-dashboard.md` + `docs/plans/hyperplexed-ui-craft-overhaul.md` (§4.2 — the merge) + `docs/plans/home-redesign-two-postures.md` (the two-postures redesign — Stages 0–2 shipped 2026-07-20, Stages 3–4 pending)
