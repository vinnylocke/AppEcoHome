# 5. Dashboard

**Spec files:** `tests/e2e/specs/dashboard.spec.ts` · `tests/e2e/specs/weather.spec.ts` · `tests/e2e/specs/tasks.spec.ts`
**Page Object:** `tests/e2e/pages/DashboardPage.ts`
**Seed dependencies:** `00_bootstrap.sql`, `01_locations_areas.sql`, `03_tasks_blueprints.sql`, `04_weather.sql`
**App-reference:** [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)

Covers the classic dashboard content. Since the Phase 4.2 dashboard merge this **no longer lives at `?view=overview`** — the Overview tab is gone and `/dashboard` has four sub-tabs (Dashboard / Locations / Calendar / Weather). The former Overview content (full `TaskList`, Head Gardener / AI Insights cards, Week Ahead, Garden Snapshot stat wall) now renders on the merged Home view behind the **Detailed** density: `DashboardPage.goto()` seeds `localStorage["rhozly:home:density"] = "detailed"` via an init script and navigates to plain `/dashboard`, so the classic-content specs in this section see it all without UI toggling. **Home redesign Stage 2 (2026-07-20): `DailyBriefCard` is deleted** — the one `HomeStatusStrip` hero serves both densities (console voice in Detailed), so specs anchor on `home-status-strip` instead of `daily-brief-card`. Also covers the **Weather** view (`?view=weather`), the **Calendar** view (`?view=calendar`) and the **Location detail** view (`?locationId=…`). The Home view's own surface (status strip, overview grid, quick actions, telemetry) is covered separately in [30-home-main.md](./30-home-main.md).

## Weather widget

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-001 | ✅ | Weather card renders with temperature + icon | — | ✅ Passing |
| DASH-002 | ✅ | Locations, Calendar and Weather view tabs visible (a subset of the four-tab switcher — Dashboard / Locations / Calendar / Weather) | — | ✅ Passing |
| DASH-003 | ✅ | Weather tab click → URL `?view=weather`, forecast panel visible | — | ✅ Passing |
| DASH-004 | ✅ | Full Forecast button — 7-day forecast expands or navigates | — | ✅ Passing |
| DASH-005..009 | ✅ | Weather code icons render correctly (WMO 0 clear, 61 rain, 71 snow, 95 thunder, 45 fog) | — | ✅ Passing |
| DASH-010..013 | ✅ | Alert badges (heat, frost, rain, wind). DASH-010 (heat), **DASH-011 (frost)** and DASH-013 (wind) are each scoped to the compact bar's own `weather-alert-bar-{type}` testid (`weather-alert-bar-frost` for DASH-011, asserting `/Frost risk tomorrow/i`) — the same alert text also renders elsewhere (the AttentionRow weather card on non-dashboard consumers, and — since redesign Stage 3 — **The Brief's `garden-brain-brief` row surfaces the frost item on the Workbench**), so a bare `getByText` goes strict-ambiguous | — | ✅ Passing (re-verified 2026-07-20) |
| DASH-MOBILE-001 | ✅ | Phone-portrait (412×915): all **four** view tabs (Dashboard / Locations / Calendar / Weather) present exactly once, Overview button count 0 (Phase 4.2 merged it into Dashboard), Weather reachable + navigates (regression: Weather clipped off-screen) | — | 🔲 Pending (re-verify post-merge) |
| DASH-014 | ✅ | No alerts on mild forecast | — | ✅ Passing |
| DASH-015 | ✅ | Garden Intelligence panel renders with at least one rule heading | — | ✅ Passing |
| DASH-016..019 | ✅ | GI rules — auto-watering, frost protection, heatwave, high wind | — | ✅ Passing |

## Locations view

Stage-1 triage found DASH-020..023 asserting the **Locations view's** h3 tiles / Indoors badge against the merged **home** (where location names render as `<p>` inside card buttons) — they now navigate via a new `DashboardPage.gotoLocations()` (`/dashboard?view=locations`) so they exercise the view they describe.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-020 | ✅ | Location tile cards visible for seeded locations (via `gotoLocations()`) | — | ✅ Passing (re-verified 2026-07-20) |
| DASH-021 | ✅ | Tile shows name ("Outside Garden") (via `gotoLocations()`) | — | ✅ Passing (re-verified 2026-07-20) |
| DASH-022 | ✅ | Indoor tile shows indoor indicator (via `gotoLocations()`) | — | ✅ Passing (re-verified 2026-07-20) |
| DASH-023 | ✅ | Click tile → URL `?locationId=LOC_GARDEN_ID` (via `gotoLocations()`) | — | ✅ Passing (re-verified 2026-07-20) |
| DASH-027 | ✅ | Quiz prompt ("Set up your Garden Quiz") absent when quiz complete (seed 08) | — | ✅ Passing |

## Single-slot onboarding + quiz banner (Phase 4.2)

The home branch in `App.tsx` renders at most **one** promo card, cascading by priority: GettingStartedChecklist → Garden Quiz prompt (headline "Set up your Garden Quiz", CTA "Start the quiz") → NotificationOptInCard → InstallPwaPrompt. The tests mock `home_quiz_completions` to `null` so the quiz is incomplete, and mock the `user_profiles` dismissal PATCH to 204 so the seeded `onboarding_state` is never polluted (the app updates local state optimistically).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-024 | ✅ | Checklist owns the promo slot while the quiz is incomplete — `getting-started-checklist` visible, quiz banner hidden | `home_quiz_completions`→null | 🔲 Pending (re-verify post-merge) |
| DASH-025 | ✅ | Dismissing the checklist (`checklist-dismiss`, single-tap X) cascades the slot to the quiz banner; dismissing the banner hides it | `home_quiz_completions`→null; `user_profiles` PATCH→204 | 🔲 Pending (re-verify post-merge) |
| DASH-026 | ✅ | Surface the quiz banner via checklist dismiss, then "Start the quiz" CTA → `/profile` | `home_quiz_completions`→null; `user_profiles` PATCH→204 | 🔲 Pending (re-verify post-merge) |

## Daily tasks sidebar

The `TaskList` (`dashboard-task-list`, "Today's tasks" heading) renders on the **Workbench** posture — `DashboardPage.goto()` seeds `rhozly:home:density = detailed`, which `readStoredPosture()` aliases to Workbench, so these rows keep working. **Redesign Stage 4:** it's now the **compact** TaskList (`compact` hides the Pending/Completed tab bar, scope filter, and bulk-edit — see `src/components/TaskList.tsx`), and the full tabbed board moved to the Calendar behind the section's "Open board →" link. DASH-028..036 assert task presence / pending-exclusion, which the compact today-view still supports (verified passing in the 2026-07-20 sweep); they don't depend on the removed tab bar.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-028 | ✅ | "Daily Tasks" section heading visible | — | ✅ Passing |
| DASH-029 | ✅ | Pending tasks list renders seeded tasks | — | ✅ Passing |
| DASH-030 | ✅ | Empty state — no tasks → prompt visible | — | ✅ Passing |
| DASH-031 | ✅ | Pending tab label includes task count | — | ✅ Passing |
| DASH-032 | ✅ | Completed tab visible | — | ✅ Passing |
| DASH-033 | ✅ | Click Completed tab → active style changes | — | ✅ Passing |
| DASH-034 | ✅ | ~~View Calendar link → URL `?view=calendar`~~ | — | ❌ RETIRED (2026-07-20) — the "View Calendar" button no longer exists anywhere in `src/` (the affordance predates the Phase 4.2 merged home). Calendar navigation is covered by the switcher-tab specs (DASH-MOBILE-001), the CAL-* suite (`gotoCalendar`), and the redesign hero's "Plan my day" chip (`hero-plan-day` → `?view=calendar`) |
| DASH-035 | ✅ | Overdue task visible (due -7 days, Pending) | — | ✅ Passing |
| DASH-036 | ✅ | Skipped task not in Pending tab | — | ✅ Passing |

## Locked feature teasers — Sprout (RHO-2)

Tier is forced to Sprout by mocking the narrow `user_profiles?select=subscription_tier` read; the rest of the app keeps its (Evergreen) profile so the dashboard still loads. **Home redesign Stage 3 (2026-07-20):** the four AI cards merged into **The Brief** (`the-brief`, both densities). The `dashboard-head-gardener-card` / `dashboard-assistant-card` wrappers survive as rows INSIDE it, and the upgrade teasers are **deduped** — the estate row's compact nudge is the page's only one; AssistantCard gets `showUpgradeWhenLocked={false}` so its nudge never doubles. DASH-040/041 were consolidated to that new reality.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-040 | ✅ | The Brief shows exactly ONE compact upgrade teaser (`Upgrade to … to use Head Gardener`, count of /Upgrade to .* to use/ inside `the-brief` = 1), inside the `dashboard-head-gardener-card` wrapper; no full-size panel (`upgrade-nudge-cta-*` absent) | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |
| DASH-041 | ✅ | The AI Insights row never doubles the teaser: `upgrade-nudge-ai_insights` count 0 page-wide and no "Upgrade to" text inside `dashboard-assistant-card` while the estate teaser shows (intent changed in Stage 3 — was "AI Insight card shows compact teaser") | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |
| DASH-042 | ✅ | No full-size upgrade panel anywhere on the Sprout dashboard (guards the `FeatureGate fallback={null}` fix) | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |

## Garden Snapshot stat tiles (RHO-13)

Phase 4.2 relocated the Overview stat wall to `src/components/home/GardenSnapshot.tsx` ("This Week at a Glance") on the Detailed home. **Zero-value tiles are now hidden** — except `dash-stat-tasks-total` and `dash-stat-plants-total`, which always render (so DASH-050 is unaffected), and empty sections hide their headers. The 7-day strip now renders **stacked dots** (WeekPulse's visual language, max 3 dots/bucket: red overdue, orange late, emerald on-time, neutral pending) instead of slash-separated numbers; the DayLegend hover/tap pills and `dash-day-{date}` → calendar click are unchanged. The snapshot defaults open only for the experienced persona; the test expands it via `dash-snapshot-toggle` before clicking a tile.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-050 | ✅ | "Total Tasks" tile navigates to the Calendar view (`view=calendar`), not `/schedule` (Routines) — tile always renders even at zero | — | 🔲 Pending (re-verify post-merge) |

## Week Ahead card gating (RHO-9)

`WeekAheadPreview` deep-links to the Evergreen-only `/weekly` overview; it is now wrapped in `<FeatureGate feature="ai_insights" fallback={null}>` so Sprout doesn't tap an available-looking card into a locked page.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-051 | ✅ | Week Ahead card (`dash-week-ahead-card`) is hidden for Sprout | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |
| DASH-052 | ✅ | Week Ahead card is visible for the Evergreen seed account (renders in Detailed density only) | — | 🔲 Pending (re-verify post-merge) |

## Plant chat AI-gating — Sprout (RHO-10 / RHO-11)

Chat is an AI feature; both entry points must disappear for a non-AI tier. The full profile read (`user_profiles?select=uid,…`) is intercepted and `ai_enabled` is forced to `false` (a Sprout profile) while the rest of the profile passes through. **Home redesign Stage 2:** `DailyBriefCard` is deleted; the ask-AI chip migrated to the console hero with the **same testid `daily-brief-ask-ai`** and the same RHO-11 gate, so DASH-043/044 now anchor on `home-status-strip` (the one hero, both densities) instead of `daily-brief-card`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-043 | ✅ | Sprout dashboard hides the global Plant Doctor chat FAB (`plant-doctor-chat-fab`) while the hero (`home-status-strip`) still renders — proves the dashboard actually loaded | `user_profiles` `ai_enabled`→false | ✅ Passing (re-verified 2026-07-20) |
| DASH-044 | ✅ | Sprout dashboard hides the migrated "Ask AI" chip (`daily-brief-ask-ai` — now on the console hero); anchored on `home-status-strip` | `user_profiles` `ai_enabled`→false | ✅ Passing (re-verified 2026-07-20) |
| DASH-045 | ✅ | AI-enabled (seeded) account still shows both the chat FAB and the chip — spec unchanged by Stage 2 (the chip keeps its `daily-brief-ask-ai` testid on the console hero) | — | ✅ Passing (re-verified 2026-07-20) |

## Overdue chip ↔ task list parity (RHO-3)

The Daily Brief "Overdue" chip is now home-scoped + ghost-aware (runs the same `taskFilters.isTaskOverdueToday` predicate the list uses), so its count must equal the overdue tasks the list shows.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-046 | ✅ | Overdue chip count equals the number of "Overdue since …" task cards in the list (or both are zero in the "all caught up" state) | — | ✅ Passing |

## Location detail (LocationPage)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| LOC-001 | ✅ | `?locationId=LOC_GARDEN_ID` → "Outside Garden" heading | — | ✅ Passing |
| LOC-002 | ✅ | Area cards (Raised Bed A, South Border) visible | — | ✅ Passing |
| LOC-003 | ✅ | Area card shows planted plants | — | ✅ Passing |
| LOC-004 | ✅ | Empty area (Greenhouse) shows "no plants" state | — | ✅ Passing |
| LOC-005 | ✅ | Indoor/Outdoor env toggle fires + toast | — | ✅ Passing |
| LOC-006 | n/a | Locked-toggle logic does not exist (`toggleEnvironment()` fires unconditionally) — see archive | — | ❌ N/A |
| LOC-007 | ✅ | Area card drilldown opens AreaDetails | — | ✅ Passing |
| LOC-008 | ✅ | Area tasks list visible in area detail | — | ✅ Passing |
| LOC-009 | ✅ | Back from area detail → area list view | — | ✅ Passing |
| LOC-010 | ✅ | Scan Area button visible | — | ✅ Passing |
| LOC-011..013 | ✅ | Area scan modal opens / cancels / shows mocked result | `scan-area` mock | ✅ Passing |
| LOC-014 | ✅ | Back to dashboard → URL drops `locationId` | — | ✅ Passing |
| LOC-015 | ❌ | Non-existent locationId → graceful error or redirect | — | ✅ Passing |

## Calendar view

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CAL-001 | ✅ | `?view=calendar` → calendar grid visible | — | ✅ Passing |
| CAL-002 | ✅ | Current month heading | — | ✅ Passing |
| CAL-003 | ✅ | Task dots on dates with tasks | — | ✅ Passing |
| CAL-004 | ✅ | Ghost task dots for blueprint recurring dates | — | ✅ Passing |
| CAL-005 | ✅ | Click date with tasks opens panel | — | ✅ Passing |
| CAL-006 | ✅ | Click empty date opens Add Task modal pre-filled | — | ✅ Passing |
| CAL-007 | ✅ | Navigate to next month — `DashboardPage.calendarNextButton` repointed to the button's aria-label (`/Next (month\|week)/`); the old page-wide `.lucide-chevron-*` class locator went strict-mode ambiguous when the redesigned hero added its own chevrons | — | ✅ Passing (re-verified 2026-07-20) |
| CAL-008 | ✅ | Navigate to previous month — `calendarPrevButton` repointed to aria-label (`/Previous (month\|week)/`), same reason | — | ✅ Passing (re-verified 2026-07-20) |
| CAL-009 | ✅ | Completed task date shows completed indicator | — | ✅ Passing |
| CAL-010 | ✅ | Skipped task not shown as pending | — | ✅ Passing |
| CAL-011 | ✅ | To-Do List button visible (`calendar-add-todo-list`) | — | ✅ Passing |
| CAL-012 | ✅ | To-Do List create flow — fill date + 2 rows → tasks linked to one `todo_lists` row | — | ✅ Passing |
| CAL-013 | ✅ | My To-Do Lists modal — `?open=todo-lists` → status pill + ticking flips derived status | — | ✅ Passing |
| CAL-014 | ✅ | TaskModal From-list pill — click opens Manage modal scrolled to that list | — | ✅ Passing |

## Calendar harvest-window visualisations (Wave 20+)

**Spec file:** `tests/e2e/specs/calendar-window.spec.ts`
**Page Object:** `tests/e2e/pages/CalendarPage.ts`
**Per-test reset:** `tests/e2e/utils/harvestSeedReset.ts` (UPDATEs three Wave-20 harvest tasks back to known-good state so mutating tests stay order-independent).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CAL-W20-001 | ✅ | Today's amber harvest highlight (22.0022) — `data-harvest-window="true"` after deselect | — | ✅ Passing |
| CAL-W20-002 | ✅ | Snoozed task NOT in today's agenda — cell may still light from other tasks | — | ✅ Passing |
| CAL-W20-003 | ✅ | Snoozed dot lands on `next_check_at` day (22.0027) | — | ✅ Passing |
| CAL-W20-004 | ✅ | Agenda hides snoozed on today | — | ✅ Passing |
| CAL-W20-005 | ✅ | Agenda reveals snoozed on `next_check_at` | — | ✅ Passing |
