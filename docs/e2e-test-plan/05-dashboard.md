# 5. Dashboard

**Spec files:** `tests/e2e/specs/dashboard.spec.ts` · `tests/e2e/specs/weather.spec.ts` · `tests/e2e/specs/tasks.spec.ts`
**Page Object:** `tests/e2e/pages/DashboardPage.ts`
**Seed dependencies:** `00_bootstrap.sql`, `01_locations_areas.sql`, `03_tasks_blueprints.sql`, `04_weather.sql`
**App-reference:** [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)

Covers the classic dashboard content. Since the Phase 4.2 dashboard merge this **no longer lives at `?view=overview`** — the Overview tab is gone and `/dashboard` has four sub-tabs (Dashboard / Locations / Calendar / Weather). The former Overview content (full `TaskList`, Daily Brief, Head Gardener / AI Insights cards, Week Ahead, Garden Snapshot stat wall) now renders on the merged Home view behind the **Detailed** density: `DashboardPage.goto()` seeds `localStorage["rhozly:home:density"] = "detailed"` via an init script and navigates to plain `/dashboard`, so the classic-content specs in this section see it all without UI toggling. Also covers the **Weather** view (`?view=weather`), the **Calendar** view (`?view=calendar`) and the **Location detail** view (`?locationId=…`). The Home view's own surface (status strip, overview grid, quick actions, telemetry) is covered separately in [30-home-main.md](./30-home-main.md).

## Weather widget

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-001 | ✅ | Weather card renders with temperature + icon | — | ✅ Passing |
| DASH-002 | ✅ | Locations, Calendar and Weather view tabs visible (a subset of the four-tab switcher — Dashboard / Locations / Calendar / Weather) | — | ✅ Passing |
| DASH-003 | ✅ | Weather tab click → URL `?view=weather`, forecast panel visible | — | ✅ Passing |
| DASH-004 | ✅ | Full Forecast button — 7-day forecast expands or navigates | — | ✅ Passing |
| DASH-005..009 | ✅ | Weather code icons render correctly (WMO 0 clear, 61 rain, 71 snow, 95 thunder, 45 fog) | — | ✅ Passing |
| DASH-010..013 | ✅ | Alert badges (heat, frost, rain, wind) | — | ✅ Passing |
| DASH-MOBILE-001 | ✅ | Phone-portrait (412×915): all **four** view tabs (Dashboard / Locations / Calendar / Weather) present exactly once, Overview button count 0 (Phase 4.2 merged it into Dashboard), Weather reachable + navigates (regression: Weather clipped off-screen) | — | 🔲 Pending (re-verify post-merge) |
| DASH-014 | ✅ | No alerts on mild forecast | — | ✅ Passing |
| DASH-015 | ✅ | Garden Intelligence panel renders with at least one rule heading | — | ✅ Passing |
| DASH-016..019 | ✅ | GI rules — auto-watering, frost protection, heatwave, high wind | — | ✅ Passing |

## Locations view

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-020 | ✅ | Location tile cards visible for seeded locations | — | ✅ Passing |
| DASH-021 | ✅ | Tile shows name ("Outside Garden") | — | ✅ Passing |
| DASH-022 | ✅ | Indoor tile shows indoor indicator | — | ✅ Passing |
| DASH-023 | ✅ | Click tile → URL `?locationId=LOC_GARDEN_ID` | — | ✅ Passing |
| DASH-027 | ✅ | Quiz prompt ("Set up your Garden Quiz") absent when quiz complete (seed 08) | — | ✅ Passing |

## Single-slot onboarding + quiz banner (Phase 4.2)

The home branch in `App.tsx` renders at most **one** promo card, cascading by priority: GettingStartedChecklist → Garden Quiz prompt (headline "Set up your Garden Quiz", CTA "Start the quiz") → NotificationOptInCard → InstallPwaPrompt. The tests mock `home_quiz_completions` to `null` so the quiz is incomplete, and mock the `user_profiles` dismissal PATCH to 204 so the seeded `onboarding_state` is never polluted (the app updates local state optimistically).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-024 | ✅ | Checklist owns the promo slot while the quiz is incomplete — `getting-started-checklist` visible, quiz banner hidden | `home_quiz_completions`→null | 🔲 Pending (re-verify post-merge) |
| DASH-025 | ✅ | Dismissing the checklist (`checklist-dismiss`, single-tap X) cascades the slot to the quiz banner; dismissing the banner hides it | `home_quiz_completions`→null; `user_profiles` PATCH→204 | 🔲 Pending (re-verify post-merge) |
| DASH-026 | ✅ | Surface the quiz banner via checklist dismiss, then "Start the quiz" CTA → `/profile` | `home_quiz_completions`→null; `user_profiles` PATCH→204 | 🔲 Pending (re-verify post-merge) |

## Daily tasks sidebar

The full `TaskList` (`dashboard-task-list`, "Daily Tasks" heading, Pending/Completed tabs) now renders only in the home's **Detailed** density — `DashboardPage.goto()` seeds it, so these rows keep working unchanged.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-028 | ✅ | "Daily Tasks" section heading visible | — | ✅ Passing |
| DASH-029 | ✅ | Pending tasks list renders seeded tasks | — | ✅ Passing |
| DASH-030 | ✅ | Empty state — no tasks → prompt visible | — | ✅ Passing |
| DASH-031 | ✅ | Pending tab label includes task count | — | ✅ Passing |
| DASH-032 | ✅ | Completed tab visible | — | ✅ Passing |
| DASH-033 | ✅ | Click Completed tab → active style changes | — | ✅ Passing |
| DASH-034 | ✅ | View Calendar link → URL `?view=calendar` | — | ✅ Passing |
| DASH-035 | ✅ | Overdue task visible (due -7 days, Pending) | — | ✅ Passing |
| DASH-036 | ✅ | Skipped task not in Pending tab | — | ✅ Passing |

## Locked feature teasers — Sprout (RHO-2)

Tier is forced to Sprout by mocking the narrow `user_profiles?select=subscription_tier` read; the rest of the app keeps its (Evergreen) profile so the dashboard still loads. The Head Gardener (`dashboard-head-gardener-card`) and AI Insights (`dashboard-assistant-card`) cards mount only in the home's **Detailed** density (seeded by `DashboardPage.goto()`).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-040 | ✅ | Head Gardener card shows compact upgrade teaser, not the full panel | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |
| DASH-041 | ✅ | AI Insight card shows compact upgrade teaser, not the full panel | `user_profiles` tier→sprout | 🔲 Pending (re-verify post-merge) |
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

Chat is an AI feature; both entry points must disappear for a non-AI tier. The full profile read (`user_profiles?select=uid,…`) is intercepted and `ai_enabled` is forced to `false` (a Sprout profile) while the rest of the profile passes through.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DASH-043 | ✅ | Sprout dashboard hides the global Plant Doctor chat FAB (`plant-doctor-chat-fab`) while the Daily Brief still renders (Daily Brief is the Detailed-density hero) | `user_profiles` `ai_enabled`→false | 🔲 Pending (re-verify post-merge) |
| DASH-044 | ✅ | Sprout dashboard hides the Daily Brief "Got a plant question?" chip (`daily-brief-ask-ai`) | `user_profiles` `ai_enabled`→false | 🔲 Pending (re-verify post-merge) |
| DASH-045 | ✅ | AI-enabled (seeded) account still shows both the chat FAB and the chip | — | 🔲 Pending (re-verify post-merge) |

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
| CAL-007 | ✅ | Navigate to next month | — | ✅ Passing |
| CAL-008 | ✅ | Navigate to previous month | — | ✅ Passing |
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
