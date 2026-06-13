# Plan — Comprehensive E2E Test Suite (catalog)

## Purpose

A single document listing every screen / modal / cross-cutting flow in the app and the E2E tests we want against it. This is a **planning artifact**: the user reviews and approves before we implement, seed, or wire any of it up.

For each surface the catalog shows:

- **Features** — every distinct user-facing action on the surface
- **Tests** — named test cases grouped by CRUD intent, validation, and edge cases
- **Status** — `✅ existing` (already covered by a spec in `tests/e2e/specs/`) · `🆕 new` (to write)
- **Seed dependency** — what already-seeded data the tests rely on (workers 0–3 are pre-loaded via `supabase/seeds/`) vs what the test must create in-flight

> **Coverage axes per feature:** happy path · validation errors · empty state · min / max / extreme inputs · loading state · error / network failure state · permission gating · tier gating · realtime sync · offline behaviour · keyboard / screen-reader path.
>
> Not every feature warrants every axis. Where an axis is irrelevant we omit it; where it's a known sharp edge we call it out.

## Current state (Jun 2026)

- **35 spec files** already exist (`tests/e2e/specs/*.spec.ts`). Each is listed under its primary surface below.
- **Seed data** — `supabase/seeds/00_bootstrap.sql` through `12_shopping_lists.sql` pre-load every worker account with a known home, locations, plants, tasks, plans, ailments, guides, weather snapshots, shopping lists, etc. UUID prefixes per worker keep them isolated.
- **Page Objects** — `tests/e2e/pages/*.ts`
- **Fixtures** — `tests/e2e/fixtures/auth.ts` injects the worker-indexed test user

## Seeding philosophy

Default to **in-test UI flows** (Add Plant → fill form → save → assert). UI-driven tests give us regression coverage of the create flow itself.

Pre-seed only when:

1. **State-setup time dominates** the test (e.g. a 25-step plan staging flow shouldn't waste 20 steps creating the plan)
2. The test asserts a **specific historic state** (overdue tasks, completed weekly overview, expired snooze) that's hard to time-shift from the UI
3. The flow **touches a remote system** during creation (Stripe, AI, Pl@ntNet) — pre-seed the result row

Where seeding is needed, we extend the existing `supabase/seeds/*.sql` numbered files in place rather than per-test fixtures, so the same data is available to every test.

## Test naming convention

`<area>.<surface>.<action>.<variant>`

Examples:
- `dashboard.weather-tab.forecast.renders-7-days-with-icons`
- `shed.add-plant.manual.rejects-blank-name`
- `tasks.task-modal.complete.shows-confetti-for-planting-type`

This keeps Playwright's grep/filter useful (`--grep "shed.add-plant"`).

---

# Catalog

## 01 — Onboarding & Auth

### 01.1 Auth Screen — `/` when signed out

`src/components/AuthScreen.tsx` · ref: [`01-onboarding/01-auth-screen.md`](../app-reference/01-onboarding/01-auth-screen.md) · existing spec: `auth.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Sign in (email + password) | `auth.sign-in.valid-credentials-redirects-to-dashboard` | ✅ |
| Sign in error | `auth.sign-in.wrong-password-shows-inline-error` | 🆕 |
| Sign in error | `auth.sign-in.unknown-email-shows-inline-error` | 🆕 |
| Sign up | `auth.sign-up.new-email-creates-account-and-routes-to-home-setup` | 🆕 |
| Sign up validation | `auth.sign-up.password-too-short-blocks-submit` | 🆕 |
| Sign up validation | `auth.sign-up.password-mismatch-blocks-submit` | 🆕 |
| Sign up validation | `auth.sign-up.invalid-email-format-blocks-submit` | 🆕 |
| Sign up validation | `auth.sign-up.email-already-in-use-shows-error` | 🆕 |
| Password reset | `auth.reset-password.sends-magic-link-toast` | 🆕 |
| OAuth (Google) | `auth.oauth.google-button-opens-provider-popup` (mock) | 🆕 |
| Session persistence | `auth.session.refresh-keeps-user-signed-in` | 🆕 |
| Sign out | `auth.sign-out.clears-session-and-returns-to-login` | 🆕 |
| Min / max | `auth.sign-up.email-up-to-254-chars-accepted` | 🆕 |
| Min / max | `auth.sign-up.password-128-chars-accepted` | 🆕 |
| Accessibility | `auth.a11y.tab-order-email-password-button` | 🆕 |

### 01.2 Welcome Modal — first-run carousel

ref: [`01-onboarding/02-welcome-modal.md`](../app-reference/01-onboarding/02-welcome-modal.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `onboarding.welcome.shows-on-first-login-only` | 🆕 |
| Carousel | `onboarding.welcome.next-button-advances-through-4-slides` | 🆕 |
| Carousel | `onboarding.welcome.dots-jump-to-slide` | 🆕 |
| Skip | `onboarding.welcome.skip-marks-welcomed-and-closes` | 🆕 |
| Finish | `onboarding.welcome.start-button-routes-to-home-setup` | 🆕 |
| Persistence | `onboarding.welcome.does-not-reopen-on-second-sign-in` | 🆕 |

### 01.3 Home Setup — first-run / Add Home

ref: [`01-onboarding/03-home-setup.md`](../app-reference/01-onboarding/03-home-setup.md)

| Feature | Test | Status |
|---------|------|--------|
| Create | `home-setup.create.minimal-fields-creates-home` | 🆕 |
| Create | `home-setup.create.with-postcode-pulls-hemisphere-and-climate` | 🆕 |
| Validation | `home-setup.create.empty-name-blocks-submit` | 🆕 |
| Validation | `home-setup.create.name-over-100-chars-truncates-or-rejects` | 🆕 |
| Validation | `home-setup.create.invalid-postcode-shows-warning-but-allows-skip` | 🆕 |
| Hemisphere | `home-setup.create.northern-postcode-marks-hemisphere-northern` | 🆕 |
| Hemisphere | `home-setup.create.southern-postcode-marks-hemisphere-southern` | 🆕 |

### 01.4 Tier Selection

ref: [`01-onboarding/04-tier-selection.md`](../app-reference/01-onboarding/04-tier-selection.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `tier-selection.shows-all-four-tiers-with-prices` | 🆕 |
| Selection | `tier-selection.sprout-confirms-and-routes-to-quiz` | 🆕 |
| Upgrade preview | `tier-selection.botanist-shows-ai-quota-detail` | 🆕 |
| Sage path | `tier-selection.sage-shows-stripe-checkout-stub` | 🆕 (mock Stripe) |

### 01.5 Garden Quiz (Habit Quiz)

ref: [`01-onboarding/05-garden-quiz.md`](../app-reference/01-onboarding/05-garden-quiz.md) · existing spec: `garden-profile.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `garden-quiz.shows-question-1-of-N` | ✅ |
| Flow | `garden-quiz.can-advance-and-back` | ✅ |
| Completion | `garden-quiz.finish-stores-onboarding-state-and-closes` | ✅ |
| Dismiss | `garden-quiz.dismiss-shows-confirm-before-closing` | 🆕 |
| Resume | `garden-quiz.partial-progress-restores-on-reopen` | 🆕 |
| Validation | `garden-quiz.cannot-finish-without-required-answers` | 🆕 |

### 01.6 Getting Started Checklist

ref: [`01-onboarding/06-getting-started-checklist.md`](../app-reference/01-onboarding/06-getting-started-checklist.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `checklist.shows-5-steps-on-empty-account` | 🆕 |
| Auto-tick | `checklist.quiz-completion-auto-ticks-step-1` | 🆕 |
| Auto-tick | `checklist.add-first-plant-auto-ticks-shed-step` | 🆕 |
| Progress | `checklist.progress-bar-reflects-completed-count` | 🆕 |
| Hide | `checklist.disappears-when-all-five-steps-done` | 🆕 |
| Collapse | `checklist.toggle-collapses-but-progress-persists` | 🆕 |

### 01.7 Notification Opt-In Card

ref: [`01-onboarding/07-notification-opt-in.md`](../app-reference/01-onboarding/07-notification-opt-in.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `notif-optin.appears-after-3-days-of-activity` | 🆕 (time-shift seed) |
| Grant | `notif-optin.grant-stores-token-and-hides-card` | 🆕 (browser permission mock) |
| Deny | `notif-optin.deny-records-state-and-hides-card` | 🆕 |
| Dismiss | `notif-optin.dismiss-defers-for-30-days` | 🆕 |

### 01.8 PWA Install Prompt

ref: [`01-onboarding/08-pwa-install.md`](../app-reference/01-onboarding/08-pwa-install.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `pwa-install.appears-after-installability-event` | 🆕 (`beforeinstallprompt` mock) |
| Install | `pwa-install.tap-install-fires-prompt-and-records-installed` | 🆕 |
| Dismiss | `pwa-install.dismiss-defers-and-respects-cooldown` | 🆕 |

---

## 02 — Dashboard

### 02.1 Dashboard Tab — `/dashboard`

ref: [`02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) · existing spec: `dashboard.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `dashboard.shell.renders-header-sidebar-stats-grid` | ✅ |
| Weather widget | `dashboard.weather-widget.shows-current-temp-and-conditions` | ✅ |
| Weather alert banner | `dashboard.weather-alert.frost-shows-orange-banner-with-overnight-low` | 🆕 |
| Weather alert banner | `dashboard.weather-alert.heatwave-shows-red-banner` | 🆕 |
| Today Focus | `dashboard.today-focus.urgent-1-overdue-routes-to-calendar-today` | ✅ |
| Today Focus | `dashboard.today-focus.streak-3-days-shows-streak-message` | 🆕 |
| Today Focus | `dashboard.today-focus.quiet-state-shows-all-caught-up` | 🆕 |
| Week Ahead | `dashboard.week-ahead.shows-7-day-strip-with-task-counts` | 🆕 |
| Week Ahead | `dashboard.week-ahead.tap-opens-weekly-overview-page` | 🆕 |
| Seasonal Picks | `dashboard.seasonal-picks.shows-4-to-6-picks-with-source-badge` | 🆕 |
| Stats grid | `dashboard.stat.tasks-overdue-routes-to-calendar-today` | ✅ |
| Stats grid | `dashboard.stat.tasks-pending-routes-to-calendar-today` | ✅ |
| Stats grid | `dashboard.stat.harvest-blueprints-shows-count-and-routes-to-schedule-harvesting` | 🆕 |
| Stats grid | `dashboard.stat.plant-doctor-sessions-routes-to-history` | 🆕 |
| Stats grid | `dashboard.stat.weather-alerts-shows-active-only` | 🆕 |
| Day strip | `dashboard.day-strip.today-cell-highlighted` | 🆕 |
| Day strip | `dashboard.day-strip.overdue-tasks-show-red-dot-count` | 🆕 |
| Day strip | `dashboard.day-strip.tap-opens-calendar-on-that-day` | 🆕 |
| Mobile shell | `dashboard.mobile.redirects-to-quick-access-on-/-when-mobile` | 🆕 |
| Empty state | `dashboard.empty-home.shows-getting-started-action-panel` | 🆕 |
| Realtime | `dashboard.realtime.task-completed-elsewhere-updates-stats-without-reload` | 🆕 |
| Pull-to-refresh | `dashboard.mobile.pull-down-reloads-data` | 🆕 |

### 02.2 Calendar Tab — `/dashboard?view=calendar`

ref: [`02-dashboard/03-calendar-tab.md`](../app-reference/02-dashboard/03-calendar-tab.md) · existing spec: parts of `dashboard.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `calendar.month-view.renders-grid-with-current-month` | ✅ |
| Navigate months | `calendar.month-view.next-arrow-moves-to-following-month` | ✅ |
| Navigate months | `calendar.month-view.jump-to-today-button-snaps-back` | ✅ |
| Day cell — dots | `calendar.month-view.day-with-3-watering-tasks-shows-3-blue-dots` | ✅ |
| Day cell — past | `calendar.month-view.past-overdue-shows-red-cross-mark` | 🆕 |
| Day cell — past | `calendar.month-view.past-completed-shows-green-check` | 🆕 |
| Day cell — harvest | `calendar.month-view.window-active-day-shows-amber-tint` | 🆕 |
| Day cell — harvest | `calendar.month-view.snoozed-task-dot-moves-to-next_check_at` | 🆕 |
| Day cell — preferred | `calendar.month-view.day-with-preferred-plant-shows-sparkle` | 🆕 |
| Agenda | `calendar.agenda.tap-day-shows-tasks-for-that-day` | ✅ |
| Agenda | `calendar.agenda.snoozed-task-hidden-during-snooze-window` | ✅ |
| Agenda | `calendar.agenda.snoozed-task-reappears-on-next_check_at` | ✅ |
| Filters | `calendar.filters.task-type-filter-narrows-dots-and-agenda` | 🆕 |
| Filters | `calendar.filters.location-area-cascade-filters-correctly` | 🆕 |
| Filters | `calendar.filters.clear-all-resets-filters-and-badge` | 🆕 |
| Drag-reschedule | `calendar.drag.move-task-to-future-day-updates-due-date` | 🆕 |
| Drag-reschedule | `calendar.drag.recurring-blueprint-asks-shift-or-this-only` | 🆕 |
| ICS export | `calendar.export.ics-button-downloads-events-file` | 🆕 |
| Week view | `calendar.week-view.shows-7-day-horizontal-strip` | 🆕 |
| Deep link | `calendar.deeplink.?view=calendar&date=YYYY-MM-DD-opens-correct-day` | 🆕 |

### 02.3 Weather Tab — `/dashboard?view=weather`

ref: [`02-dashboard/04-weather-tab.md`](../app-reference/02-dashboard/04-weather-tab.md) · existing spec: `weather.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `weather-tab.forecast.shows-7-day-grid-with-icons-temps-rain` | ✅ |
| Current conditions | `weather-tab.current.shows-temp-humidity-wind-uv` | ✅ |
| Alerts | `weather-tab.alerts.frost-banner-shows-affected-locations` | ✅ |
| Alerts | `weather-tab.alerts.expired-alert-does-not-show` | 🆕 |
| Garden Intelligence | `weather-tab.intelligence.skip-watering-rule-fires-with-rain` | 🆕 |
| Garden Intelligence | `weather-tab.intelligence.frost-protection-rule-fires-overnight` | 🆕 |
| Rain rule breakdown | `weather-tab.intelligence.rain-breakdown-lists-blueprints-with-tick-or-grey` | 🆕 |
| Empty state | `weather-tab.empty.no-postcode-shows-add-postcode-cta` | 🆕 |

### 02.4 Locations Tab + Location Page

refs: [`02-dashboard/02-locations-tab.md`](../app-reference/02-dashboard/02-locations-tab.md), [`07-location-page.md`](../app-reference/02-dashboard/07-location-page.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `locations-tab.shows-location-cards-with-plant-and-task-counts` | ✅ |
| Drill-in | `locations-tab.tap-card-opens-location-detail` | ✅ |
| Location page | `location-page.shows-area-breakdown-with-plants-per-area` | 🆕 |
| Location page | `location-page.today-tasks-filtered-to-location-only` | 🆕 |
| Empty | `locations-tab.no-locations-shows-add-location-cta` | 🆕 |

### 02.5 Quick Access Home — `/quick` (mobile)

ref: [`02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) · existing spec: `quick-access.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `quick-access.shows-hero-greeting-with-firstname` | ✅ |
| Hero | `quick-access.hero.tap-routes-to-dashboard` | 🆕 |
| Tiles | `quick-access.tiles.default-shows-8-pinned-destinations` | ✅ |
| Tiles | `quick-access.tiles.tap-tile-navigates-to-route` | ✅ |
| Top bar | `quick-access.burger.top-left-opens-drawer` | 🆕 |
| Top bar | `quick-access.profile-avatar.top-right-opens-dropdown` | 🆕 |
| Customise | `quick-access.customise-link-routes-to-account-launcher-section` | 🆕 |
| Walk tile | `quick-access.walk-tile-shows-and-routes-to-walk` | 🆕 |
| Seasonal Picks | `quick-access.seasonal-picks-strip-renders-and-tapping-opens-detail` | 🆕 |

### 02.6 Localized Task Calendar — `/quick/calendar`

ref: [`02-dashboard/10-localized-task-calendar.md`](../app-reference/02-dashboard/10-localized-task-calendar.md) · existing spec: `quick-calendar.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `quick-calendar.today-card-shows-pending-task-list` | ✅ |
| Frost helper | `quick-calendar.frost-soon-shows-warning-strip` | 🆕 |
| Rain helper | `quick-calendar.rain-coming-suggests-skip-watering` | 🆕 |
| Sow window | `quick-calendar.sow-window-now-shows-seasonal-tip` | 🆕 |
| Tap task | `quick-calendar.tap-task-opens-task-modal-from-quick-shell` | 🆕 |

### 02.7 Garden Walk — `/walk`

ref: [`02-dashboard/13-garden-walk.md`](../app-reference/02-dashboard/13-garden-walk.md)

| Feature | Test | Status |
|---------|------|--------|
| Start | `walk.starts-session-and-shows-first-plant-card` | 🆕 |
| Outcomes | `walk.snap.records-photo-and-advances` | 🆕 |
| Outcomes | `walk.note.adds-quick-note-and-advances` | 🆕 |
| Outcomes | `walk.all-good.advances-without-side-effect` | 🆕 |
| Outcomes | `walk.skip.keeps-plant-in-tomorrow-walk` | 🆕 |
| Stop | `walk.stop.shows-summary-card-with-counts` | 🆕 |
| Walk again | `walk.again.starts-new-session-and-skipped-plants-appear-first` | 🆕 |
| Empty state | `walk.no-plants-shows-add-plant-cta` | 🆕 |
| Ailment flag | `walk.ailment-flag-records-to-watchlist` | 🆕 |

### 02.8 Weekly Overview — `/weekly`

ref: [`02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `weekly-overview.shows-date-range-and-7-sections` | 🆕 (seed weekly_overviews row) |
| Tasks section | `weekly-overview.tasks.shows-count-and-busiest-day` | 🆕 |
| Weather events | `weekly-overview.weather.shows-frost-and-rain-rows` | 🆕 |
| Sowings | `weekly-overview.sowings.shows-packet-rows-with-due-date` | 🆕 |
| Harvest windows | `weekly-overview.harvest.window-opening-this-week-listed` | 🆕 |
| AI tips | `weekly-overview.ai-tips.sage-shows-tip-list-sprout-hidden` | 🆕 |
| Pollen | `weekly-overview.pollen.shows-grass-birch-ragweed-rows` | 🆕 |
| Regenerate | `weekly-overview.regenerate.sage-only-button-fires-cron-equivalent` | 🆕 |
| Empty | `weekly-overview.no-overview-yet-shows-empty-state-card` | 🆕 |

### 02.9 Seasonal Picks Card

ref: [`02-dashboard/14-seasonal-picks.md`](../app-reference/02-dashboard/14-seasonal-picks.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `seasonal-picks.shows-4-to-6-cards-with-image-and-name` | 🆕 |
| Source | `seasonal-picks.sage-shows-ai-badge-sprout-shows-curated-badge` | 🆕 |
| Cache | `seasonal-picks.same-week-uses-cached-row` | 🆕 |
| Detail | `seasonal-picks.tap-card-opens-plant-detail-modal` | 🆕 |
| Add to Shed | `seasonal-picks.add-to-shed-creates-plant-row` | 🆕 |
| Refresh | `seasonal-picks.week-rollover-fetches-fresh-row` | 🆕 |

---

## 03 — Garden Hub

### 03.1 The Shed — `/shed`

ref: [`03-garden-hub/01-the-shed.md`](../app-reference/03-garden-hub/01-the-shed.md) · existing specs: `shed-crud.spec.ts`, `plants.spec.ts`, `ai-plant-freshness.spec.ts`, `ai-plant-override.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `shed.list.shows-plant-cards-grouped` | ✅ |
| Tabs | `shed.tabs.shed-nursery-notes-watchlist-route-correctly` | 🆕 |
| Search | `shed.search.types-match-by-common-name` | ✅ |
| Search | `shed.search.matches-by-scientific-name` | 🆕 |
| Search | `shed.search.no-match-shows-empty-state` | 🆕 |
| Source filter | `shed.filter.source-perenual-narrows-to-perenual-only` | 🆕 |
| Source filter | `shed.filter.source-pl@ntnet-includes-only-pl@ntnet` | 🆕 |
| Sort | `shed.sort.alphabetical-orders-az` | 🆕 |
| Sort | `shed.sort.ai-preference-floats-preferred-plants-up` | 🆕 |
| Status tabs | `shed.status.active-tab-hides-archived` | ✅ |
| Status tabs | `shed.status.archived-tab-shows-only-archived` | ✅ |
| Add plant — library | `shed.add-plant.library-result-saves-and-appears-on-list` | ✅ |
| Add plant — manual | `shed.add-plant.manual-required-name-creates-plant` | ✅ |
| Add plant — manual | `shed.add-plant.manual-blank-name-blocks-submit` | 🆕 |
| Add plant — manual | `shed.add-plant.manual-256-char-name-shows-validation` | 🆕 |
| Add plant — paste list | `shed.add-plant.paste-multiline-resolves-each-and-shows-queue` | 🆕 |
| Add plant — bulk | `shed.add-plant.select-3-plants-and-bulk-add-queues-3` | 🆕 |
| Bulk add states | `shed.add-plant.bulk-queue-shows-pending-processing-success-error` | 🆕 |
| Card actions | `shed.card.edit-opens-edit-modal-with-fields-prefilled` | ✅ |
| Card actions | `shed.card.archive-lists-active-tasks-and-confirms` | ✅ |
| Card actions | `shed.card.delete-with-2-instances-shows-instance-warning` | ✅ |
| Card actions | `shed.card.restore-archived-returns-to-active-tab` | ✅ |
| Plant detail | `shed.detail.shows-instances-grouped-by-area` | ✅ |
| Plant detail | `shed.detail.care-routine-card-shows-watering-and-sun` | 🆕 |
| Plant detail | `shed.detail.active-tasks-link-to-task-modal` | 🆕 |
| Credit badge | `shed.card.credit-badge-popover-shows-source-and-licence` | 🆕 |
| Nursery toggle | `shed.toggle.nursery-flips-to-nursery-tab` | 🆕 |
| Empty | `shed.empty.no-plants-shows-add-first-plant-cta` | ✅ |
| Realtime | `shed.realtime.plant-added-in-other-tab-appears-without-reload` | ✅ |
| Tier gating | `shed.tier.sprout-cannot-trigger-ai-generate-button` | 🆕 |

### 03.2 Plant Edit / Assignment / Instance Edit / Bulk Assign

refs: `08-modals-and-overlays/06,07,08,39`

| Feature | Test | Status |
|---------|------|--------|
| Edit plant | `plant-edit.update-name-and-save-updates-card-label` | ✅ |
| Edit plant | `plant-edit.upload-image-replaces-thumbnail` | ✅ |
| Edit plant | `plant-edit.add-labels-shows-chips-on-card` | 🆕 |
| Edit plant | `plant-edit.save-without-required-name-blocks` | 🆕 |
| Assign instances | `plant-assign.area-picker-cascades-location-area` | ✅ |
| Assign instances | `plant-assign.quantity-stepper-min-1-max-99` | 🆕 |
| Instance edit | `instance-edit.tab-details-shows-status-and-area` | ✅ |
| Instance edit | `instance-edit.tab-routines-shows-blueprints` | 🆕 |
| Instance edit | `instance-edit.tab-photos-uploads-and-shows-in-gallery` | 🆕 |
| Instance edit | `instance-edit.tab-journal-add-entry-saves` | 🆕 |
| Instance edit | `instance-edit.tab-care-guide-renders-on-data` | 🆕 |
| Instance edit | `instance-edit.tab-yield-record-harvest-stores-amount` | 🆕 |
| Bulk assign | `bulk-assign.3-plants-to-same-area-creates-3-instances` | 🆕 |

### 03.3 Ailment Watchlist — `/shed?tab=watchlist`

ref: [`03-garden-hub/02-watchlist.md`](../app-reference/03-garden-hub/02-watchlist.md) · existing spec: `watchlist.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `watchlist.shows-ailment-cards-by-type` | ✅ |
| Add — manual | `watchlist.add.manual-required-name-and-type-creates-ailment` | ✅ |
| Add — manual | `watchlist.add.manual-blank-name-blocks` | 🆕 |
| Add — database | `watchlist.add.search-perenual-prefills-steps` | 🆕 |
| Add — AI | `watchlist.add.ai-description-creates-with-tasks-on-sage` | 🆕 |
| Severity | `watchlist.card.severity-mild-moderate-severe-show-colour` | 🆕 |
| Steps | `watchlist.detail.prevention-steps-show-in-order` | 🆕 |
| Steps | `watchlist.detail.create-task-from-step-creates-blueprint-or-task` | ✅ |
| Linking | `watchlist.detail.link-plant-instance-stores-association` | 🆕 |
| Archive | `watchlist.archive.removes-from-active-tab` | 🆕 |
| Restore | `watchlist.restore.brings-back-to-active` | 🆕 |
| Filter | `watchlist.filter.pest-only-narrows-to-pest-cards` | 🆕 |
| Search | `watchlist.search.matches-by-name` | 🆕 |
| Tier gating | `watchlist.tier.ai-tab-disabled-for-sprout` | 🆕 |

### 03.4 Location Manager — `/management`

ref: [`03-garden-hub/03-location-manager.md`](../app-reference/03-garden-hub/03-location-manager.md) · existing specs: `layout.spec.ts`, `area-setup.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Create location | `loc-manager.create.minimal-fields-creates-location` | ✅ |
| Create location | `loc-manager.create.outside-toggle-affects-weather-rules` | 🆕 |
| Edit location | `loc-manager.edit.inline-name-edit-saves` | ✅ |
| Delete location | `loc-manager.delete.with-areas-confirms-cascade` | ✅ |
| Create area | `loc-manager.create-area.required-name-creates` | ✅ |
| Area metrics | `loc-manager.create-area.ph-out-of-range-shows-validation` | 🆕 |
| Area metrics | `loc-manager.create-area.lux-negative-blocks-submit` | 🆕 |
| Area metrics | `loc-manager.create-area.tooltip-explains-ph-lux-medium` | 🆕 |
| Area edit | `loc-manager.edit-area.metrics-saved-and-shown-on-card` | ✅ |
| Area delete | `loc-manager.delete-area.with-plants-prompts-keep-or-cascade` | ✅ |

### 03.5 Garden Layout List + Editor — `/layout`

refs: [`05`](../app-reference/03-garden-hub/05-garden-layout-list.md), [`06`](../app-reference/03-garden-hub/06-garden-layout-editor.md) · existing specs: `garden-layout.spec.ts`, `layout.spec.ts`, `lighttab.spec.ts`, `statstab.spec.ts`

Existing coverage spans 17 stages (GLB-001 through GLB-017). New tests to consider:

| Feature | Test | Status |
|---------|------|--------|
| Living map | `layout.living-map.plant-icons-render-at-saved-coords` | 🆕 |
| Smart map | `layout.smart-map.sun-fit-shows-overlay` | 🆕 |
| Microclimate | `layout.microclimate.report-shows-per-area-rollup` | 🆕 |
| Undo/Redo | `layout.history.ctrl-z-undoes-last-shape` | 🆕 |
| Free-form | `layout.draw.pen-tool-creates-arbitrary-shape` | 🆕 |

### 03.6 Sun Tracker AR — `/sun-trajectory`

ref: [`03-garden-hub/08-sun-tracker-ar.md`](../app-reference/03-garden-hub/08-sun-tracker-ar.md) · existing spec: `sun-tracker.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `sun-tracker.opens-and-shows-camera-permission-prompt` | ✅ |
| Arc | `sun-tracker.arc-renders-with-current-time-marker` | ✅ |
| Time slider | `sun-tracker.slider-moves-arc-to-future-time` | 🆕 |
| Permission deny | `sun-tracker.camera-denied-shows-fallback-screen` | 🆕 |

### 03.7 Light Sensor — `/lightsensor`

ref: [`03-garden-hub/09-light-sensor.md`](../app-reference/03-garden-hub/09-light-sensor.md) · existing spec: `lightsensor.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `lightsensor.shows-lux-readout-and-band` | ✅ |
| Sensor | `lightsensor.native-sensor-or-pixel-fallback-engages` | ✅ |
| Calibration | `lightsensor.factor-slider-changes-lux-output` | 🆕 |
| Save | `lightsensor.save-to-area-updates-area-lux` | ✅ |

### 03.8 The Nursery — `/shed` Nursery toggle

ref: [`03-garden-hub/10-nursery.md`](../app-reference/03-garden-hub/10-nursery.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `nursery.shows-packet-grid-and-summary-stats` | 🆕 |
| Add packet — manual | `nursery.add-packet.manual-required-species-and-sow-by-creates` | 🆕 |
| Add packet — bulk paste | `nursery.add-packet.paste-multiline-resolves-each` | 🆕 |
| Add packet — scan | `nursery.add-packet.scan-runs-ai-and-prefills` | 🆕 (mock AI) |
| Sow | `nursery.sow.modal-takes-date-quantity-area-and-creates-sowing` | 🆕 |
| Germinate | `nursery.germinate.records-date-and-success-rate` | 🆕 |
| Plant out | `nursery.plant-out.creates-matching-shed-instances` | 🆕 |
| Plant out queue | `nursery.queue.shows-active-sowings-ready-to-plant` | 🆕 |
| Calendar view | `nursery.calendar.shows-sow-windows-by-month` | 🆕 |
| Hemisphere | `nursery.calendar.southern-account-shows-southern-windows` | 🆕 |

### 03.9 Global Journal — `/journal`

ref: [`03-garden-hub/11-global-journal.md`](../app-reference/03-garden-hub/11-global-journal.md) · existing spec: `quick-journal.spec.ts` (legacy)

| Feature | Test | Status |
|---------|------|--------|
| Render | `journal.shows-entries-sorted-by-date-desc` | 🆕 |
| Filter | `journal.filter.by-target-plant-narrows` | 🆕 |
| Filter | `journal.filter.by-target-area-narrows` | 🆕 |
| Add entry | `journal.add-entry.with-photo-uploads-and-attaches` | 🆕 |
| Auto-update | `journal.auto-update.task-complete-creates-journal-entry-with-toggle` | 🆕 |
| Delete | `journal.delete.entry-confirms-and-removes` | 🆕 |

### 03.10 Senescence — ended plant instances

ref: [`03-garden-hub/12-senescence.md`](../app-reference/03-garden-hub/12-senescence.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `senescence.shows-ended-instances-with-reason-chip` | 🆕 |
| Filter | `senescence.filter.natural-only-narrows-list` | 🆕 |
| Restore | `senescence.restore.brings-instance-back-and-regenerates-tasks` | 🆕 |

### 03.11 Notes — `/notes`

(no dedicated app-reference doc beyond the `documentation/16-notes.md` user doc)

| Feature | Test | Status |
|---------|------|--------|
| Render | `notes.shows-pinned-row-and-grid` | 🆕 |
| Create | `notes.create.title-only-saves` | 🆕 |
| Create | `notes.create.body-rich-text-headings-lists-tables-render-on-reload` | 🆕 |
| Link | `notes.link.attach-plant-shows-chip-and-appears-on-plant-page` | 🆕 |
| Link | `notes.link.attach-area-shows-chip-and-appears-on-area-page` | 🆕 |
| Unlink | `notes.unlink.x-on-chip-removes-link` | 🆕 |
| Pin | `notes.pin.note-moves-to-pinned-row` | 🆕 |
| Archive | `notes.archive.hides-from-feed-and-restores-from-archived-tab` | 🆕 |
| Search | `notes.search.title-and-body-match` | 🆕 |
| Multi-user | `notes.realtime.note-added-by-member-appears-without-reload` | 🆕 |

---

## 04 — Planner & Shopping

### 04.1 Planner Dashboard — `/planner`

ref: [`04-planner/01-planner-dashboard.md`](../app-reference/04-planner/01-planner-dashboard.md) · existing spec: `planner.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `planner.shows-plan-cards-with-status-tabs` | ✅ |
| Status tabs | `planner.tabs.in-progress-completed-archived-filter-correctly` | ✅ |
| Card actions | `planner.card.options-menu-shows-archive-delete` | ✅ |
| New Plan | `planner.new-plan.wizard-prompt-step-validates-non-empty` | ✅ |
| New Plan | `planner.new-plan.ai-returns-blueprint-and-user-accepts` | ✅ (AI mocked) |
| New Plan | `planner.new-plan.name-and-create-stores-plan` | ✅ |
| Overhaul (Sage+) | `planner.overhaul.button-hidden-for-sprout-and-botanist` | 🆕 |
| Overhaul (Sage+) | `planner.overhaul.upload-photo-and-submit-creates-plan-row` | 🆕 (mock AI) |
| Overhaul (Sage+) | `planner.overhaul.result-view-shows-3-concepts-and-pick-one` | 🆕 |
| Archive | `planner.card.archive-moves-to-archived-tab` | ✅ |
| Restore | `planner.card.restore-from-archived-brings-to-active` | 🆕 |
| Delete | `planner.card.delete-confirms-and-removes-permanently` | ✅ |

### 04.2 Plan Staging

ref: [`04-planner/02-plan-staging.md`](../app-reference/04-planner/02-plan-staging.md)

| Feature | Test | Status |
|---------|------|--------|
| Phase 1 | `plan-staging.phase1-infrastructure.area-selection-unlocks-phase-2` | 🆕 |
| Phase 2 | `plan-staging.phase2-shed.shows-need-to-source-checkboxes` | 🆕 |
| Phase 2 | `plan-staging.phase2-shed.select-all-and-add-to-shopping-list` | 🆕 |
| Phase 3 | `plan-staging.phase3-staging.task-list-editable-and-reorderable` | 🆕 |
| Phase 3 | `plan-staging.phase3-staging.stage-tasks-creates-blueprints` | 🆕 |
| Phase 4 | `plan-staging.phase4-execution.progress-bar-reflects-completed-tasks` | 🆕 |
| Phase 5 | `plan-staging.phase5-maintenance.generates-recurring-blueprints` | 🆕 |
| Reference photos | `plan-reference-photos.upload-and-attach-show-on-plan-page` | 🆕 |

### 04.3 Shopping Lists — `/shopping`

ref: [`04-planner/05-shopping-lists.md`](../app-reference/04-planner/05-shopping-lists.md) · existing spec: `shopping.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `shopping.shows-active-and-completed-sections` | ✅ |
| Create — blank | `shopping.create.blank-list-creates-empty-list` | ✅ |
| Create — template | `shopping.create.starter-toolkit-prepopulates-items` | 🆕 |
| Create — template | `shopping.create.seasonal-veg-patch-prepopulates-items` | 🆕 |
| Rename | `shopping.list.rename-saves-on-tap-away` | ✅ |
| Expand | `shopping.list.expand-shows-item-rows-and-progress` | ✅ |
| Add item — plant | `shopping.add.plant-search-shed-first-then-all-sources` | ✅ |
| Add item — plant | `shopping.add.plant-from-search-prompts-add-to-shed-after` | ✅ |
| Add item — product | `shopping.add.product-name-and-category-required` | ✅ |
| Add item — validation | `shopping.add.empty-name-blocks-submit` | 🆕 |
| Tick | `shopping.tick.item-strikethrough-updates-progress` | ✅ |
| Untick | `shopping.tick.uncheck-restores-and-decrements-progress` | 🆕 |
| Add purchased to Shed | `shopping.add-to-shed.button-with-3-checked-plants-shows-and-adds` | ✅ |
| Add purchased to Shed | `shopping.add-to-shed.toast-confirms-count` | 🆕 |
| Mark complete | `shopping.list.mark-complete-moves-to-completed-section` | ✅ |
| Reopen | `shopping.list.reopen-from-completed-restores-to-active` | 🆕 |
| Delete | `shopping.list.delete-requires-second-tap-confirmation` | ✅ |

### 04.4 Blueprint Manager / Schedule — `/schedule`

ref: [`04-planner/07-blueprint-manager.md`](../app-reference/04-planner/07-blueprint-manager.md) · existing spec: `schedule.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `schedule.shows-blueprint-cards` | ✅ |
| Create | `schedule.create.required-title-type-frequency-creates` | ✅ |
| Create | `schedule.create.harvest-with-end-date-uses-window-model` | 🆕 |
| Create — validation | `schedule.create.frequency-zero-blocks-submit` | 🆕 |
| Create — validation | `schedule.create.frequency-9999-allowed-as-very-rare` | 🆕 |
| Create — validation | `schedule.create.start-date-after-end-date-blocks-submit` | 🆕 |
| Edit | `schedule.edit.update-frequency-applies-to-future-tasks-only` | ✅ |
| Pause | `schedule.pause.until-date-suppresses-ghost-emission` | 🆕 |
| Delete — blueprint only | `schedule.delete.blueprint-only-keeps-materialised-tasks` | ✅ |
| Delete — and tasks | `schedule.delete.blueprint-and-tasks-removes-all-linked` | ✅ |
| Filter | `schedule.filter.by-task-type-narrows-list` | ✅ |
| Filter | `schedule.filter.by-location-area-cascade-works` | 🆕 |
| Sort | `schedule.sort.frequency-most-frequent-first` | 🆕 |
| Sort | `schedule.sort.plant-name-respects-ai-preference` | 🆕 |
| Auto blueprints | `schedule.auto.complete-planting-task-creates-care-blueprints` | 🆕 |
| Realtime | `schedule.realtime.blueprint-added-in-other-tab-appears` | 🆕 |

### 04.5 Optimise Tab

ref: [`04-planner/08-optimise-tab.md`](../app-reference/04-planner/08-optimise-tab.md) · existing spec: `schedule.spec.ts` Optimise section

| Feature | Test | Status |
|---------|------|--------|
| Render | `optimise.shows-find-improvements-button` | ✅ |
| Fragmentation | `optimise.fragmentation.proposes-merge-of-3-similar-blueprints` | 🆕 |
| Frequency | `optimise.frequency-change.suggests-tweak-with-reason` | 🆕 |
| Retire | `optimise.retire.no-active-instances-suggests-archive` | 🆕 |
| Apply | `optimise.apply.modifies-blueprint-and-shows-undo-history` | ✅ |
| Undo | `optimise.undo.within-90-days-restores-previous` | 🆕 |
| AI-Powered | `optimise.ai.sage-button-runs-and-shows-extra-proposals` | 🆕 |
| Tier gating | `optimise.ai.hidden-for-sprout` | 🆕 |

---

## 05 — Tools

### 05.1 Tools Hub — `/tools`

ref: [`05-tools/01-tools-hub.md`](../app-reference/05-tools/01-tools-hub.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `tools-hub.shows-tile-grid-grouped-by-category` | 🆕 |
| Navigate | `tools-hub.tap-tile-routes-to-respective-page` | 🆕 |
| Tier-gated tile | `tools-hub.sage-tile-shows-lock-for-sprout` | 🆕 |

### 05.2 Plant Doctor / Plant Lens — `/doctor`

refs: [`02`](../app-reference/05-tools/02-plant-doctor.md), [`03`](../app-reference/05-tools/03-plant-doctor-chat.md), [`04`](../app-reference/05-tools/04-plant-doctor-history.md) · existing spec: `plant-doctor.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Upload | `lens.upload.gallery-pick-shows-preview` | ✅ |
| Upload | `lens.upload.camera-permission-grant-shows-feed` | 🆕 |
| Identify — Pl@ntNet | `lens.identify.pl@ntnet-tile-shows-top-match-with-cc-by-sa-badge` | ✅ |
| Identify — Rhozly AI | `lens.identify.also-from-rhozly-ai-tile-renders` | ✅ |
| Identify — agree | `lens.identify.both-agree-shows-chip` | 🆕 |
| Identify — none of these | `lens.identify.none-of-these-re-runs-with-context` | 🆕 |
| Diagnose | `lens.diagnose.disease-result-shows-name-severity-symptoms` | ✅ |
| Diagnose — apply | `lens.diagnose.apply-treatment-creates-tasks-and-shopping-items` | ✅ |
| Pest | `lens.pest.identifies-pest-and-suggests-actions` | 🆕 |
| Add to Shed | `lens.add-to-shed.confirms-and-routes-back-with-toast` | ✅ |
| Link to plant | `lens.link.assign-to-plant-adds-to-watchlist` | ✅ |
| History | `lens.history.shows-past-sessions-with-thumbnails` | ✅ |
| History | `lens.history.filter-by-disease-narrows` | 🆕 |
| Save toggle | `lens.upload.uncheck-save-prevents-history-row` | 🆕 |
| Validation | `lens.upload.over-10mb-image-shows-size-error` | 🆕 |
| Tier gating | `lens.tier.sprout-shows-monthly-quota-pill` | 🆕 |
| Chat | `lens.chat.send-message-saves-once-not-twice-on-reload` | 🆕 (regression for 22.0023) |
| Chat | `lens.chat.cucumber-not-in-shed-offers-add-to-shed` | 🆕 (regression for 22.0023) |
| Chat | `lens.chat.care-advice-offers-create-task-prompt` | 🆕 |
| Chat | `lens.chat.confirm-tool-call-executes-add-plant` | 🆕 |
| Chat | `lens.chat.cancel-tool-call-leaves-no-side-effect` | 🆕 |
| Chat | `lens.chat.voice-mic-button-records-and-sends-transcript` | 🆕 (mock STT) |
| Chat | `lens.chat.voice-reply-speaker-icon-plays-audio` | 🆕 |

### 05.3 Plant Visualiser — `/visualiser`

ref: [`05-tools/05-plant-visualiser.md`](../app-reference/05-tools/05-plant-visualiser.md) · existing spec: `visualiser.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Select | `visualiser.select.multiple-plants-shows-tick` | ✅ |
| Sprite Wizard | `visualiser.sprite.sources-tab-shows-unsplash-perenual-existing` | 🆕 |
| Sprite Wizard | `visualiser.sprite.upload-photo-removes-background` | 🆕 |
| Camera | `visualiser.camera.tap-sprite-adds-to-overlay` | ✅ |
| Camera | `visualiser.camera.drag-resizes-and-repositions` | 🆕 |
| AI placement | `visualiser.ai-placement.button-locked-for-sprout` | 🆕 |
| AI placement | `visualiser.ai-placement.fires-on-sage-and-shows-results` | 🆕 |
| Capture | `visualiser.capture.saves-snapshot-to-gallery` | 🆕 |
| Gallery | `visualiser.gallery.tap-thumbnail-opens-fullscreen` | 🆕 |

### 05.4 Companion Planting — `/companions`

ref: [`08-modals-and-overlays/11-companion-plants-tab.md`](../app-reference/08-modals-and-overlays/11-companion-plants-tab.md) · existing spec: `companion-plants.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `companions.shows-plant-cards-with-good-and-avoid` | ✅ |
| Add to plan | `companions.tap-suggested-companion-adds-to-current-plan` | ✅ |
| Filter | `companions.filter.by-area-narrows-pairs` | 🆕 |

### 05.5 Guides — `/guides`

refs: [`07`](../app-reference/05-tools/07-guides-list.md), [`08`](../app-reference/05-tools/08-community-guide-reader.md), [`09`](../app-reference/05-tools/09-community-guide-editor.md) · existing specs: `guides.spec.ts`, `community-guides.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Tabs | `guides.tabs.rhozly-community-app-help-route-correctly` | ✅ |
| Search | `guides.search.matches-title-and-tags` | ✅ |
| Sort | `guides.sort.most-starred-orders-by-stars-desc` | ✅ |
| Filter | `guides.filter.tag-dropdown-narrows-by-tag` | 🆕 |
| Read guide | `guides.reader.tap-card-opens-reading-view` | ✅ |
| Star | `guides.reader.star-toggles-and-updates-count` | ✅ |
| Comment | `guides.reader.add-comment-saves-and-renders` | ✅ |
| Comment | `guides.reader.reply-creates-thread` | 🆕 |
| Comment | `guides.reader.delete-own-comment` | 🆕 |
| Write guide | `guides.editor.add-text-section-saves` | ✅ |
| Write guide | `guides.editor.add-image-uploads-and-renders` | 🆕 |
| Write guide | `guides.editor.add-steps-section-with-3-steps` | 🆕 |
| Write guide | `guides.editor.reorder-sections-via-drag` | 🆕 |
| Publish | `guides.editor.publish-makes-visible-in-community-tab` | ✅ |
| Draft | `guides.editor.unpublished-stays-as-draft-and-is-private` | 🆕 |
| Validation | `guides.editor.empty-title-blocks-publish` | 🆕 |
| App Help | `guides.app-help.ask-question-returns-answer` | 🆕 (mock AI) |

### 05.6 Garden Profile / Habit Quiz settings — `/profile`

ref: [`05-tools/10-garden-profile.md`](../app-reference/05-tools/10-garden-profile.md) · existing spec: `garden-profile.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `garden-profile.shows-quiz-and-swipe-tabs` | ✅ |
| Swipe deck | `garden-profile.swipe.right-records-positive-preference` | ✅ |
| Swipe deck | `garden-profile.swipe.left-records-negative-preference` | ✅ |
| Preferences | `garden-profile.preferences.list-shows-positive-and-negative-chips` | ✅ |
| Remove | `garden-profile.preferences.remove-chip-deletes-record` | ✅ |
| Reset | `garden-profile.preferences.reset-all-requires-double-tap` | 🆕 |
| Stats | `garden-profile.stats.quiz-status-and-preference-count-shown` | 🆕 |
| AI usage | `garden-profile.ai-usage.tokens-rendered-from-usage-log` | 🆕 |

---

## 06 — Account & Settings

### 06.1 Account Tab — `/gardener`

ref: [`06-account/01-account-tab.md`](../app-reference/06-account/01-account-tab.md)

| Feature | Test | Status |
|---------|------|--------|
| Display name | `account.display-name.save-updates-header-greeting` | 🆕 |
| Display name | `account.display-name.empty-blocks-save` | 🆕 |
| Display name | `account.display-name.256-chars-clamped-or-rejected` | 🆕 |
| Email | `account.email.save-triggers-confirmation-toast` | 🆕 |
| Email | `account.email.invalid-format-blocks-submit` | 🆕 |
| Password | `account.password.wrong-current-password-shows-error` | 🆕 |
| Password | `account.password.mismatch-blocks-submit` | 🆕 |
| Password | `account.password.success-shows-toast-and-clears-fields` | 🆕 |
| Tier switcher | `account.tier.upgrade-to-botanist-confirms-and-applies` | 🆕 (mock Stripe) |
| Tier switcher | `account.tier.downgrade-shows-warning-about-features` | 🆕 |
| AI Usage panel | `account.ai-usage.shows-tokens-and-rate-limit` | 🆕 |
| Accessibility | `account.a11y.high-contrast-toggle-applies-class-to-body` | 🆕 |
| Quick Launcher | `account.launcher.toggle-tile-adds-to-pinned-list` | 🆕 |
| Quick Launcher | `account.launcher.drag-handle-reorders-pins` | 🆕 |
| Quick Launcher | `account.launcher.reset-to-defaults-restores-eight` | 🆕 |
| Persona | `account.persona.select-cheerful-updates-toast-tone` | 🆕 |
| Voice | `account.voice.toggle-auto-read-saves` | 🆕 |
| Data Export | `account.export.download-button-emits-zip` | 🆕 |
| Delete Account | `account.delete.requires-typing-DELETE` | 🆕 |
| Delete Account | `account.delete.cancel-keeps-account` | 🆕 |
| Delete Account | `account.delete.confirm-cascade-removes-data` | 🆕 |
| Reset Account Data (admin) | `account.reset.admin-only-button-visible` | 🆕 (regression for 22.0017) |
| Reset Account Data (admin) | `account.reset.hidden-for-non-admin` | 🆕 |
| Reset Account Data (admin) | `account.reset.confirm-RESET-wipes-data-and-reloads-empty` | 🆕 |

### 06.2 Notifications Tab — `/gardener?tab=notifications`

ref: [`06-account/02-notifications-tab.md`](../app-reference/06-account/02-notifications-tab.md)

| Feature | Test | Status |
|---------|------|--------|
| Permission | `notifications.permission.grant-shows-allowed-state` | 🆕 |
| Permission | `notifications.permission.denied-shows-revoke-banner-link` | 🆕 |
| Toggles | `notifications.toggle.master-off-disables-all-categories` | 🆕 |
| Toggles | `notifications.toggle.golden-hour-off-suppresses-push` | 🆕 |
| Toggles | `notifications.toggle.weekly-overview-off-suppresses-sunday-push` | 🆕 |

### 06.3 Awards / Stats / Beta Feedback / Accessibility / Data Export

Existing specs: `statstab.spec.ts`, partial `garden-profile.spec.ts`.

| Feature | Test | Status |
|---------|------|--------|
| Awards | `awards.shows-unlocked-and-locked-with-progress` | ✅ |
| Awards | `awards.unlock-fires-via-event-and-shows-confetti` | 🆕 |
| Stats | `stats.tab.shows-gardener-stats-rollup` | ✅ |
| Beta feedback | `beta.submit.opens-from-banner-and-saves` | 🆕 |
| Beta feedback | `beta.list.shows-own-submissions-with-status` | 🆕 |
| Accessibility | `a11y.section.high-contrast-toggle-persists-across-reload` | 🆕 |
| Data Export | `export.download-zip-includes-known-csv-files` | 🆕 |

---

## 07 — Management & Admin

### 07.1 Home Management Overview — `/home-management`

ref: [`07-management/01-home-management-overview.md`](../app-reference/07-management/01-home-management-overview.md)

| Feature | Test | Status |
|---------|------|--------|
| Render | `home-mgmt.shows-tabs-members-homes-climate-integrations-audit` | 🆕 |
| Tier gating | `home-mgmt.audit-tab-hidden-for-non-admin` | 🆕 |

### 07.2 Members & Permissions

ref: [`07-management/02-members-permissions.md`](../app-reference/07-management/02-members-permissions.md)

| Feature | Test | Status |
|---------|------|--------|
| Invite | `members.invite.email-creates-pending-invite-row` | 🆕 |
| Invite | `members.invite.invalid-email-blocks-submit` | 🆕 |
| Permissions | `members.permission.toggle-can-edit-plants-saves` | 🆕 |
| Remove | `members.remove.confirms-and-removes-from-home` | 🆕 |
| Owner transfer | `members.owner-transfer.requires-confirm-and-updates-role` | 🆕 |
| Self-removal | `members.leave-home.self-leave-shows-warning-and-removes` | 🆕 |

### 07.3 Multiple Homes

ref: [`07-management/03-multiple-homes.md`](../app-reference/07-management/03-multiple-homes.md)

| Feature | Test | Status |
|---------|------|--------|
| Switch | `homes.switch.home-dropdown-changes-and-clears-cache` | 🆕 |
| Add | `homes.add.create-new-home-routes-to-setup` | 🆕 |

### 07.4 Home Climate Settings

| Feature | Test | Status |
|---------|------|--------|
| Edit | `climate.edit.update-frost-dates-saves` | 🆕 |
| Edit | `climate.edit.invalid-zone-shows-validation` | 🆕 |

### 07.5 Integrations — Devices / Automations / Readings

refs: [`05`](../app-reference/07-management/05-integrations-devices.md), [`06`](../app-reference/07-management/06-integrations-automations.md), [`07`](../app-reference/07-management/07-integrations-readings.md)

| Feature | Test | Status |
|---------|------|--------|
| Devices | `devices.add.shelly-valve-with-creds-creates-row` | 🆕 |
| Devices | `devices.add.bad-creds-shows-error` | 🆕 |
| Devices | `devices.delete.confirms-and-removes` | 🆕 |
| Automations | `automations.create.schedule-with-rain-skip-toggle` | 🆕 |
| Automations | `automations.create.rain-skip-marks-task-as-skipped-when-fires` | 🆕 (regression for 22.0024) |
| Automations | `automations.edit.toggle-active-pauses-scheduled-runs` | 🆕 |
| Readings | `readings.shows-soil-readings-grouped-by-area` | 🆕 |

### 07.6 Audit Log — `/audit`

ref: [`07-management/08-audit-log.md`](../app-reference/07-management/08-audit-log.md) · existing spec: `reports.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `audit.shows-rows-with-event-time-cost` | ✅ |
| Filter | `audit.filter.date-range-narrows` | ✅ |
| Tokens column | `audit.column.tokens-shows-prompt-and-completion-totals` | 🆕 |
| Hidden | `audit.access.non-admin-redirected-to-dashboard` | 🆕 |

---

## 08 — Modals & Overlays (selected — most testable)

Most modals are exercised inside their parent surface's tests. Below are stand-alone modal flows worth their own coverage.

### 08.1 Add Task / Edit Schedule Modal

ref: [`08-modals-and-overlays/01-add-task-modal.md`](../app-reference/08-modals-and-overlays/01-add-task-modal.md) · existing spec: `tasks.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Open | `add-task.opens-from-global-quick-add` | ✅ |
| Open | `add-task.opens-from-calendar-add-button` | ✅ |
| Plant assignment | `add-task.plant.location-area-species-instance-cascade` | ✅ |
| Plant assignment | `add-task.plant.no-instances-allows-task-without-plant` | 🆕 |
| Task details | `add-task.required-title-blocks-submit` | ✅ |
| Task details | `add-task.title-256-chars-allowed` | 🆕 |
| Recurring | `add-task.recurring.toggle-creates-blueprint-instead-of-task` | ✅ |
| Recurring | `add-task.recurring.start-date-required` | 🆕 |
| Recurring | `add-task.recurring.frequency-zero-blocked` | 🆕 |
| Dependencies | `add-task.deps.search-and-link-blocked-by-task` | 🆕 |
| Scope | `add-task.scope.personal-vs-home-stored-correctly` | 🆕 |
| Assign | `add-task.assign.to-other-member-saves-assignee` | 🆕 |
| Save | `add-task.save-creates-row-and-appears-on-calendar` | ✅ |

### 08.2 Task Detail Modal

ref: [`08-modals-and-overlays/02-task-modal.md`](../app-reference/08-modals-and-overlays/02-task-modal.md) · existing spec: `tasks.spec.ts`

| Feature | Test | Status |
|---------|------|--------|
| Render | `task-modal.opens-with-all-fields-populated` | ✅ |
| Edit | `task-modal.edit-title-and-save-updates-card` | ✅ |
| Complete | `task-modal.complete.simple-task-marks-done` | ✅ |
| Complete | `task-modal.complete.planting-task-updates-plant-status-and-creates-blueprints` | 🆕 |
| Complete | `task-modal.complete.harvesting-task-shows-archive-prompt` | ✅ |
| Postpone | `task-modal.postpone.date-picker-and-also-shift-blueprint-toggle` | ✅ |
| Postpone | `task-modal.postpone.date-in-the-past-blocked` | 🆕 |
| Delete | `task-modal.delete.confirm-modal-and-also-delete-blueprint` | ✅ |
| Edit instances | `task-modal.instances.edit-and-save-updates-linked-plants` | ✅ |
| Dependencies | `task-modal.deps.blocking-tasks-prevent-complete` | ✅ |
| Bulk edit | `task-modal.bulk.select-3-complete-marks-all` | ✅ |
| Bulk edit | `task-modal.bulk.postpone-3-shifts-all-by-N-days` | 🆕 |
| Harvest window | `task-modal.harvest.not-yet-3-days-sets-next_check_at` | 🆕 (regression for 22.0027) |
| Harvest window | `task-modal.harvest.snoozed-hidden-until-next_check_at` | 🆕 |
| Harvest window | `task-modal.harvest.ai-ripeness-button-sage-only` | 🆕 |
| Auto-watered | `task-modal.auto-watered.chip-shown-when-skipped-by-rain` | 🆕 |

### 08.3 Other modal flows — pointers only

| Modal | Test focus | Status |
|-------|-----------|--------|
| Plant Source Picker | source-picker.shows-3-sources-and-opens-respective-flow | ✅ |
| Bulk Search Modal | bulk-search.library-first-then-perenual-then-verdantly | ✅ |
| Manual Plant Creation | manual-plant.required-name-and-save | ✅ |
| Plant Search Modal | plant-search.opens-from-quick-add | 🆕 |
| Plant Edit Modal | (in 03.2 above) | ✅ |
| Instance Edit Modal | (in 03.2 above) | ✅ |
| Plant Detail Modal | plant-detail.opens-from-search-result-See-full-care-link | 🆕 |
| Bulk Assign Modal | bulk-assign.3-plants-to-area-creates-3-instances | 🆕 |
| Add Ailment Modal | (in 03.3 above) | ✅ |
| Link Ailment Modal | link-ailment.from-task-modal-attaches-instance-ailment | 🆕 |
| Confirm Modal | confirm.confirm-and-cancel-paths-emit-correct-callbacks | 🆕 |
| Contact Support Modal | support.send-form-creates-row-and-shows-thanks | 🆕 |
| Release Notes Modal | release-notes.opens-on-version-change-and-on-Whats-New | 🆕 |
| Privacy / Cookie | policies.open-from-footer-and-from-account-dropdown | 🆕 |
| Global Search | global-search.shortcut-opens-and-types-finds-plant-area-task | 🆕 |
| Global Quick Add | quick-add.opens-from-plus-button-and-each-option-routes-correctly | 🆕 |
| Help Center | help-center.drawer-opens-and-walkthroughs-tab-shows-flows | 🆕 |
| Quick Add Task | quick-add-task.4-fields-only-and-saves | 🆕 |
| To-Do Lists | todo.create-list-add-3-tasks-tick-all-completes-list | 🆕 |
| Lifecycle Complete | lifecycle.end-of-life-records-with-optional-ai-cause-analysis | 🆕 |
| Photo Uploader | photo-uploader.max-10mb-and-shows-preview | 🆕 |
| Photo Annotation | photo-annotation.draw-arrow-and-save-stores-overlay | 🆕 |

---

## 09 — Persistent UI

| Surface | Test | Status |
|---------|------|--------|
| Header | `header.shows-logo-search-quick-add-profile-on-desktop` | ✅ |
| Header | `header.home-dropdown-switches-between-2-homes` | 🆕 |
| Sidebar | `sidebar.collapsed-shows-icons-only` | ✅ |
| Sidebar | `sidebar.overdue-badge-1-shows-rose-dot-on-home-icon` | 🆕 (regression for 22.0020) |
| Sidebar | `sidebar.snoozed-task-not-in-overdue-badge` | 🆕 (regression for 22.0020) |
| Offline Badge | `offline-badge.shows-when-network-offline` | ✅ |
| Queued Actions Badge | `queued-actions.count-reflects-localStorage-queue` | 🆕 |
| Sync Indicator | `sync-indicator.spins-during-realtime-write-and-stops` | 🆕 |
| Update Banner | `update-banner.appears-on-sw-onneedrefresh` | 🆕 |
| Update Banner | `update-banner.countdown-zero-fires-reload` | 🆕 (regression for 22.0014) |
| Update Banner | `update-banner.sw-aware-reload-activates-waiting-worker` | 🆕 (regression for 22.0014) |
| Pull To Refresh | `ptr.drag-down-on-dashboard-fires-data-reload` | 🆕 |
| Error Page | `error-page.simulated-render-error-shows-fallback-and-sentry-id` | 🆕 |
| Maintenance Screen | `maintenance.maintenance-mode-on-shows-screen-and-blocks-app` | 🆕 |
| Toast | `toast.success-error-loading-styles-distinct` | 🆕 |

---

## 99 — Cross-cutting end-to-end flows

These are multi-screen "session" tests that exercise the whole stack. They give us regression coverage that individual surface tests can miss.

| Flow | Test | Status |
|------|------|--------|
| Onboarding | `flow.onboarding.sign-up-to-first-task-end-to-end` | 🆕 |
| Care cycle | `flow.care.add-plant-create-watering-blueprint-complete-task` | 🆕 |
| Harvest window | `flow.harvest.create-blueprint-with-end-date-snooze-3-days-then-complete` | 🆕 |
| Plant Doctor → Watchlist | `flow.doctor.diagnose-disease-link-to-instance-creates-watchlist-entry` | 🆕 |
| Plan → Shopping | `flow.plan.create-plan-stage-phase-2-adds-source-plants-to-shopping-list` | 🆕 |
| Plan → Schedule | `flow.plan.stage-phase-3-creates-blueprints-on-schedule-page` | 🆕 |
| Multi-home | `flow.multi-home.switch-home-shows-different-data-and-RLS-isolation` | ✅ (data-isolation.spec.ts) |
| Realtime | `flow.realtime.add-plant-in-tab-1-shows-in-tab-2-without-reload` | ✅ (realtime.spec.ts) |
| Offline | `flow.offline.create-task-while-offline-queues-and-flushes-on-reconnect` | 🆕 |
| Offline | `flow.offline.queued-action-survives-page-reload` | 🆕 |
| PWA install | `flow.pwa.install-prompt-and-icon-appears` | 🆕 |
| PWA update | `flow.pwa.deploy-bumps-version-and-update-banner-applies-cleanly` | 🆕 |
| Push notification | `flow.push.notification-tap-deep-links-to-data.route` | 🆕 |

---

## Security & RLS — already partly covered (security-*.spec.ts)

| Concern | Test | Status |
|---------|------|--------|
| RLS isolation | `security.rls.user-cannot-read-other-home-plants` | ✅ |
| RLS isolation | `security.rls.user-cannot-read-other-home-notes` | 🆕 |
| RLS isolation | `security.rls.user-cannot-update-other-home-tasks` | 🆕 |
| XSS | `security.xss.injected-html-in-note-body-rendered-safe` | ✅ |
| XSS | `security.xss.plant-name-with-script-tag-escaped` | 🆕 |
| XSS | `security.xss.guide-title-rendered-as-text-not-html` | 🆕 |
| Auth | `security.auth.expired-jwt-routes-to-login` | ✅ |
| Auth | `security.auth.refresh-token-rotation-on-call` | 🆕 |
| Storage | `security.storage.user-cannot-fetch-others-private-photo` | ✅ |
| Storage | `security.storage.signed-url-expiry-respected` | 🆕 |
| CSRF | `security.csrf.edge-function-checks-jwt-on-mutation` | 🆕 |
| Rate limit | `security.rate-limit.over-quota-returns-429-not-crash` | 🆕 |

---

## Accessibility (mostly net-new)

| Concern | Test | Status |
|---------|------|--------|
| Focus | `a11y.focus-ring-visible-on-keyboard-nav-not-on-mouse` | 🆕 |
| Skip link | `a11y.skip-link-jumps-to-main-content` | 🆕 |
| Modal contract | `a11y.modal.focus-traps-and-restores-on-close` | 🆕 |
| Modal contract | `a11y.modal.esc-key-closes` | 🆕 |
| Modal contract | `a11y.modal.aria-labelledby-correct` | 🆕 |
| Headings | `a11y.headings.hierarchical-and-unique-h1-per-page` | 🆕 |
| Reduced motion | `a11y.motion.prefers-reduced-disables-shepherd-animations` | 🆕 |
| High contrast | `a11y.contrast.toggle-applies-class-and-meets-WCAG-AA` | 🆕 |
| Forms | `a11y.forms.every-input-has-label-and-error-aria-describedby` | 🆕 |
| Live regions | `a11y.live.toast-and-update-banner-announce-via-aria-live` | 🆕 |

---

## PWA & Offline

| Concern | Test | Status |
|---------|------|--------|
| Service worker | `pwa.sw.registers-on-load` | 🆕 |
| Service worker | `pwa.sw.precache-includes-app-shell` | 🆕 |
| Service worker | `pwa.sw.skip-waiting-activates-on-postMessage` | 🆕 (regression for 22.0014) |
| Offline shell | `pwa.offline.app-shell-loads-without-network` | 🆕 |
| Offline data | `pwa.offline.cached-dashboard-renders-from-localStorage` | 🆕 |
| Manifest | `pwa.manifest.name-icons-start-url-correct` | 🆕 |
| Install prompt | (in 01.8) | 🆕 |

---

## Performance budget tests (smoke)

| Concern | Test | Status |
|---------|------|--------|
| Bundle size | `perf.budget.index-js-under-400kb-gzipped` | 🆕 |
| First contentful paint | `perf.dashboard.fcp-under-2s-on-3g-fast` | 🆕 |
| Time to interactive | `perf.dashboard.tti-under-4s-on-3g-fast` | 🆕 |
| Lighthouse | `perf.lighthouse.dashboard-meets-90-perf-score` | 🆕 |

---

# Seeding strategy summary

For each major test area, the seed dependency:

| Area | Seed file(s) | What it gives us | What tests still create in-flight |
|------|--------------|------------------|----------------------------------|
| Onboarding & Auth | `00_bootstrap.sql` | Test user + home only | Sign-up flow runs UI form |
| Dashboard | `01-08` | Locations, plants, tasks, weather, plans, ailments, prefs | Pull-to-refresh, realtime, alert dismissal |
| Shed | `02_plants_shed.sql` | 6 plants, 6 instances of every status | Add-plant flow runs UI |
| Schedule | `03_tasks_blueprints.sql` | 8 blueprints, 12 tasks of every status | Create / edit blueprint runs UI |
| Planner | `05_planner.sql` | 3 plans, one of each status | New Plan wizard runs UI |
| Watchlist | `06_ailments_watchlist.sql` | 4 ailments | Add ailment runs UI |
| Guides | `07_guides.sql` | 3 guides | Write guide runs UI |
| Profile | `08_profile_preferences.sql` | Quiz-completed + 5 preferences | Resetting preferences runs UI |
| Shopping | `12_shopping_lists.sql` | 2 lists with 6 items | Create list / add item runs UI |
| Weekly Overview | **NEW** `13_weekly_overview.sql` | Seed a weekly_overviews row + pollen_snapshot | Manual regen runs UI |
| Notes | **NEW** `14_notes.sql` | 3 notes (pinned, regular, archived) | Add note runs UI |
| Nursery | **NEW** `15_nursery.sql` | 4 packets, 2 active sowings | Sow / plant-out flows run UI |
| Garden Walk | **NEW** `16_walk.sql` | None needed (uses Shed seed) | Walk session runs UI |
| Audit | **NEW** `17_audit_log.sql` | Seed admin role + N ai_usage_log rows | Filter runs UI |
| Members | **NEW** `18_members.sql` | A second test member added to the home | Invite flow runs UI |

Six new seed files would round out coverage; the rest of the tests can build state from the UI.

---

# Next step (after user confirms this catalog)

1. **Cut the catalog into themed PRs**, e.g. `tests/e2e/wave-1-shed-flow.spec.ts` ships every 🆕 in section 03.1 plus the Shed-related modal tests. Each PR ≈ 15–30 tests.
2. **Author missing Page Objects** for any surface that doesn't have one yet — they go in `tests/e2e/pages/`.
3. **Write the six new seed files** above so the dependent tests have their fixtures.
4. **Set up Playwright MCP wiring** so the agent can drive flows during PR review (a separate small task).
5. **Update `docs/e2e-test-plan.md`** living doc as each PR lands (tick status, fix failing).
6. **Add a CI gate** that fails the build if a new file lands in `src/components/` without a matching spec in `tests/e2e/specs/`.

## Estimated effort

- ~470 total tests catalogued. Existing ≈ 110, new ≈ 360.
- At ~15 min average per net-new test (page object + spec + seed glue), that's 90 hours of focused work.
- Distributed across themed PRs of 25 tests each ≈ 14 PRs.
- Realistic delivery cadence: 2 PRs / week with a single contributor → 7 weeks to full coverage.

This is the catalog for review. Confirm what's in / out, and we'll start with whichever themed PR you want first.

---

# Deep-dive additions (Round 2)

User feedback: *"on the new user flow, when you are automatically taken to the home setup screen you have the option to join a home so we need tests around joining a valid home, entering an invalid code, etc."*

Right — Round 1 was too altitudinal. Most surfaces have sub-flows worth a dedicated test each. The additions below are organised the same way as the main catalog and should be considered part of it. Round 2 adds **~140 tests**, bringing the total to **~610** (≈110 existing, ≈500 net-new).

This round digs into the surfaces where I undercounted in Round 1. I'll keep adding rounds as you flag more.

---

## R2.01 — Home Setup → **Join Existing Home** (gap the user called out)

ref: [`01-onboarding/03-home-setup.md`](../app-reference/01-onboarding/03-home-setup.md). Source: `src/components/HomeSetup.tsx` `handleJoin()` (lines 91–135).

**Sub-flow contract:**
- Step selection → tap "Join Existing Home" → paste Home ID → Submit
- INSERTs into `home_members` with `role: "member"`, then updates `user_profiles.home_id`.
- Errors surface as a generic "Invalid Home ID or you are already a member." banner.
- RLS does the gatekeeping — any join failure (bad UUID, RLS denial, dup row) collapses to one error message.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-001 | `home-setup.join.tile-routes-to-join-step` | Selection screen "Join Existing Home" tile sets step to `join` | 🆕 |
| R2-002 | `home-setup.join.cancel-back-to-selection` | Cancel button on join step returns to the tile picker without losing state | 🆕 |
| R2-003 | `home-setup.join.empty-input-keeps-submit-disabled` | Trimmed-empty input does not trigger the join request | 🆕 |
| R2-004 | `home-setup.join.whitespace-only-treated-as-empty` | `"   "` does not submit; banner not shown until first real attempt | 🆕 |
| R2-005 | `home-setup.join.invalid-uuid-format-shows-banner` | Submitting `"not-a-uuid"` → banner *"Invalid Home ID or you are already a member."* and `formError` persists until next change | 🆕 |
| R2-006 | `home-setup.join.unknown-home-id-shows-banner` | Submitting a well-formed UUID for a home the user has no RLS access to → same generic banner; no leaked existence signal | 🆕 |
| R2-007 | `home-setup.join.valid-home-id-on-different-account-joins-and-routes` | Use worker 0's home id from worker 1 → joined, profile updated, lands on dashboard scoped to that home | 🆕 |
| R2-008 | `home-setup.join.already-member-shows-banner-and-does-not-duplicate-row` | Re-joining a home where the user is already a member fails with the generic banner; `home_members` row count unchanged | 🆕 |
| R2-009 | `home-setup.join.success-updates-profile-home-id` | Post-join `user_profiles.home_id` equals the pasted Home ID; dashboard data is the joined home's | 🆕 |
| R2-010 | `home-setup.join.success-fires-onHomeCreated-callback` | Caller's `onHomeCreated` is invoked with the joined id (App.tsx test harness asserts) | 🆕 |
| R2-011 | `home-setup.join.no-sync-weather-call` | Joining does NOT trigger `sync-weather` (only create flow does) | 🆕 |
| R2-012 | `home-setup.join.tab-key-flows-name-input-cancel-submit` | Tab order is correct and visible focus ring on each focused element | 🆕 |
| R2-013 | `home-setup.join.paste-via-clipboard-trims-leading-trailing-whitespace` | Pasted ID with surrounding whitespace is `.trim()`'d before submit | 🆕 |
| R2-014 | `home-setup.join.same-user-rejoin-after-being-removed-works` | After owner removes member, member can re-join via the same ID | 🆕 |

### R2.02 — Home Setup → Create-flow gaps Round 1 missed

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-015 | `home-setup.create.timezone-auto-detect-prefills-from-browser` | Initial value matches `Intl.DateTimeFormat().resolvedOptions().timeZone` | 🆕 |
| R2-016 | `home-setup.create.timezone-override-persists-to-row` | User changes timezone before submit; `homes.timezone` reflects override | 🆕 |
| R2-017 | `home-setup.create.country-change-flips-hemisphere-chip` | UK → Northern; Argentina → Southern; chip updates live | 🆕 |
| R2-018 | `home-setup.create.postcode-uppercased-on-send` | Lowercased input is sent uppercase to the RPC | 🆕 |
| R2-019 | `home-setup.create.postcode-skipped-still-creates-home` | Empty postcode allowed; weather just empty afterwards | 🆕 |
| R2-020 | `home-setup.create.cancel-X-hidden-on-first-run` | When `hasExistingHome=false`, cancel X is not in the DOM | 🆕 |
| R2-021 | `home-setup.create.cancel-X-visible-when-hasExistingHome` | Adding a second home from Home Management → X is present and closes the modal | 🆕 |
| R2-022 | `home-setup.create.sync-weather-failure-does-not-block-route` | Mock sync-weather → 500 → user still lands on dashboard with empty weather | 🆕 |
| R2-023 | `home-setup.create.network-failure-shows-banner-and-keeps-form-state` | RPC offline error preserves typed values for retry | 🆕 |

### R2.03 — Welcome Modal sub-flows

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-024 | `welcome.slide-1.shows-app-name-and-tagline` | First slide renders correct copy | 🆕 |
| R2-025 | `welcome.slide-2.shows-location-area-plant-diagram` | Hierarchy diagram visible | 🆕 |
| R2-026 | `welcome.slide-3.shows-task-schedule-explainer` | Recurring task copy renders | 🆕 |
| R2-027 | `welcome.slide-4.cta-buttons-visible` | "Take the Garden Quiz" + "Skip for now" both render | 🆕 |
| R2-028 | `welcome.skip-from-slide-1-marks-welcomed` | Skip-now exits and records `welcomed_at` immediately | 🆕 |
| R2-029 | `welcome.skip-from-slide-3-marks-welcomed-same-way` | Skip behaviour is identical regardless of where in the carousel | 🆕 |
| R2-030 | `welcome.take-quiz-from-slide-4-routes-to-profile` | Quiz CTA navigates to `/profile?tab=quiz` | 🆕 |
| R2-031 | `welcome.localStorage-flag-rhozly_welcomed-prevents-reopen` | After dismiss, hard-reload doesn't show welcome again | 🆕 |
| R2-032 | `welcome.swipe-on-mobile-advances-slide` | Touch swipe gesture moves to next slide | 🆕 |
| R2-033 | `welcome.esc-key-closes-modal-as-skip` | Pressing Escape behaves like Skip | 🆕 |

### R2.04 — Garden Quiz / Habit Quiz sub-flows

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-034 | `quiz.q1-experience.single-select-required-blocks-next` | Cannot advance without an answer | 🆕 |
| R2-035 | `quiz.q-time-available.slider-min-max-respected` | Hours/week slider boundaries clamp at 0 and 40 | 🆕 |
| R2-036 | `quiz.q-climate-zone.options-are-five-temperate-mediterranean-tropical-arid-continental` | Exact option set verified | 🆕 |
| R2-037 | `quiz.q-growing-conditions.indoor-outdoor-mixed` | Three options exclusive | 🆕 |
| R2-038 | `quiz.q-goals.multi-select-min-1-required` | Cannot finish with zero goals; >=1 required | 🆕 |
| R2-039 | `quiz.q-goals.multi-select-max-N-cap` | UI prevents selecting more than the max | 🆕 |
| R2-040 | `quiz.progress.indicator-updates-as-step-advances` | Step indicator reflects current question | 🆕 |
| R2-041 | `quiz.back-button.preserves-prior-answer-on-return` | Going back, answer is still selected | 🆕 |
| R2-042 | `quiz.partial-progress-saved-to-onboarding_state` | Mid-quiz close + reopen restores progress | 🆕 |
| R2-043 | `quiz.finish-updates-profile-and-fires-toast` | Completion sets `quiz_done` and shows confirmation | 🆕 |
| R2-044 | `quiz.retake-prefills-with-previous-answers` | Retake reopens with last answers | 🆕 |

### R2.05 — Tier Selection (deeper)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-045 | `tier.sprout.confirm-route-to-quiz-or-dashboard` | Free path skips Stripe | 🆕 |
| R2-046 | `tier.botanist.stripe-success-callback-flips-tier` | Mock Stripe success → `subscription_tier='botanist'` | 🆕 |
| R2-047 | `tier.botanist.stripe-cancel-callback-keeps-sprout` | Mock Stripe cancel → tier unchanged | 🆕 |
| R2-048 | `tier.sage.stripe-checkout-includes-correct-price-id` | Verify Stripe session params | 🆕 |
| R2-049 | `tier.downgrade.evergreen-to-sprout-shows-feature-loss-warning` | Lists features being lost (Garden Overhaul etc.) | 🆕 |
| R2-050 | `tier.downgrade.confirm-applies-at-period-end-not-immediately` | Tier change scheduled, not instant | 🆕 |

---

## R2.06 — Task Modal — Harvest Window footer (Wave 20)

ref: [`08-modals-and-overlays/02-task-modal.md`](../app-reference/08-modals-and-overlays/02-task-modal.md). Round 1 had a single "harvest" line — this is the actual 4-button footer plus the closed-window footer.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-051 | `task-modal.harvest.in-window-shows-2x2-grid-and-picked-so-far-pill` | Footer renders 4 buttons + running total | 🆕 |
| R2-052 | `task-modal.harvest.in-window-pill-shows-N-days-left-green` | Pill is green while window open | 🆕 |
| R2-053 | `task-modal.harvest.harvested-button-marks-completed-final` | Sets `status=Completed`, materialises ghost | 🆕 |
| R2-054 | `task-modal.harvest.picked-some.sheet-opens-with-quantity-unit-notes-snooze` | HarvestPartialPickSheet structure | 🆕 |
| R2-055 | `task-modal.harvest.picked-some.creates-yield-record-per-linked-instance` | One `yield_records` row per instance | 🆕 |
| R2-056 | `task-modal.harvest.picked-some.snooze-3d-sets-next_check_at-but-leaves-status-pending` | Status stays `Pending`, `next_check_at` set | 🆕 |
| R2-057 | `task-modal.harvest.picked-some.disabled-when-no-inventory-item-ids` | Button greyed-out for unlinked tasks | 🆕 |
| R2-058 | `task-modal.harvest.picked-some.unit-mismatch-displayed-separately` | Mixed-unit yields shown as `100g · 5 punnets` | 🆕 |
| R2-059 | `task-modal.harvest.not-yet.3-day-popover-options-3-5-7` | Popover shows three options | 🆕 |
| R2-060 | `task-modal.harvest.not-yet.snooze-7d-capped-at-window-end-if-exceeded` | 7 days beyond window_end clamps to window_end | 🆕 |
| R2-061 | `task-modal.harvest.not-yet.regression-22.0027-task-hidden-during-snooze` | After snooze, task hidden until next_check_at on calendar | 🆕 |
| R2-062 | `task-modal.harvest.not-yet.regression-22.0027-dot-moves-to-next_check_at` | Calendar dot lands on next_check_at, not original due_date | 🆕 |
| R2-063 | `task-modal.harvest.ai-check.button-hidden-for-sprout-and-botanist` | Tier gating | 🆕 |
| R2-064 | `task-modal.harvest.ai-check.ripe-verdict-marks-completed` | Mock returns `ripe` → status=Completed | 🆕 |
| R2-065 | `task-modal.harvest.ai-check.not-yet-verdict-sets-next_check_at` | `estimated_days_until_ripe=5` → next_check_at +5d | 🆕 |
| R2-066 | `task-modal.harvest.ai-check.cap-1-to-28-days` | Verdict 0 days → clamps to 1; 60 days → clamps to 28 | 🆕 |
| R2-067 | `task-modal.harvest.window-closed.pill-flips-amber` | After window_end_date passes, pill is amber | 🆕 |
| R2-068 | `task-modal.harvest.window-closed.log-yield-anyway-marks-completed-late` | Late completion path | 🆕 |
| R2-069 | `task-modal.harvest.window-closed.mark-missed-sets-skipped` | Status flips to `Skipped` | 🆕 |
| R2-070 | `task-modal.harvest.materialisation.ghost-completion-creates-real-row-first` | Ghost ID format `ghost-{bp}-{date}` → real `tasks` row created | 🆕 |

### R2.07 — Task Modal — general gaps

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-071 | `task-modal.complete.unblocks-dependent-tasks` | Completing a blocker → dependent ✓ removes lock | 🆕 |
| R2-072 | `task-modal.dep.add-dependency-search-respects-home-scope` | Cannot link to another home's tasks | 🆕 |
| R2-073 | `task-modal.dep.remove-dependency-x-button-unlinks` | Inline X clears dependency | 🆕 |
| R2-074 | `task-modal.completion-photo.upload-stores-and-displays-url` | Photo path under `task-photos` bucket | 🆕 |
| R2-075 | `task-modal.completion-photo.upload-10mb-rejected` | Over-size → toast error | 🆕 |
| R2-076 | `task-modal.postpone.shift-blueprint-toggle-shifts-future-instances-only` | Past completed remain, future shift | 🆕 |
| R2-077 | `task-modal.postpone.checkbox-hidden-for-non-blueprint-tasks` | Standalone tasks have no shift checkbox | 🆕 |
| R2-078 | `task-modal.delete.also-delete-blueprint-checkbox-cascade` | Deletes blueprint + all materialised | 🆕 |
| R2-079 | `task-modal.weather-context.shows-rain-mm-and-temp-when-available` | Weather card renders | 🆕 |

---

## R2.08 — Plant Doctor Chat — deeper

ref: [`05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md). The chat is more capable than the line item in Round 1 suggested — tool calls (read/confirm/destructive), voice, page context, plan suggestion lifecycle, feedback, history persistence.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-080 | `chat.persist.on-cold-open-history-loads-from-DB` | All previous turns visible after fresh load | 🆕 |
| R2-081 | `chat.persist.regression-22.0023-no-duplicate-on-reload` | Each assistant turn shown exactly once after close-and-reopen | 🆕 |
| R2-082 | `chat.persist.clear-conversation-deletes-rows` | Delete all `chat_messages` for user; UI empty state | 🆕 |
| R2-083 | `chat.context.pageContext-on-dashboard-injected-into-prompt` | Mock prompt assertion: includes "Dashboard" | 🆕 |
| R2-084 | `chat.context.pageContext-on-light-sensor-includes-lux-and-area` | Includes "Light Sensor at area X with lux Y" | 🆕 |
| R2-085 | `chat.context.pageContext-on-plant-doctor-image-includes-image-flag` | Image-aware prompting | 🆕 |
| R2-086 | `chat.suggested-plants.ChatPlantCard-shows-wikipedia-summary` | Cards include Wiki info | 🆕 |
| R2-087 | `chat.suggested-plants.add-to-shed-creates-plant-and-toast` | Action button creates Shed row | 🆕 |
| R2-088 | `chat.suggested-tasks.task-action-buttons-create-blueprint` | Inline add creates blueprint | 🆕 |
| R2-089 | `chat.plan-suggestion.appears-at-most-once-per-thread` | Multiple turns don't re-show PlanSuggestionCard | 🆕 |
| R2-090 | `chat.plan-suggestion.accept-creates-plan-row-and-routes` | Accept → `/planner/:id` | 🆕 |
| R2-091 | `chat.feedback.thumbs-up-stores-positive` | `chat_feedback.rating='positive'` | 🆕 |
| R2-092 | `chat.feedback.thumbs-down-stores-negative` | `chat_feedback.rating='negative'` | 🆕 |
| R2-093 | `chat.image-attach.preview-shown-before-send` | Image preview visible in pending row | 🆕 |
| R2-094 | `chat.image-attach.send-includes-base64-and-mimeType` | Edge function payload contract | 🆕 |
| R2-095 | `chat.image-attach.camera-button-on-capacitor-uses-native-camera` | Native vs web path branches | 🆕 |
| R2-096 | `chat.regenerate.button-shown-after-failure-and-retries` | "Regenerate" replays last user turn | 🆕 |
| R2-097 | `chat.regression-22.0018-shed-check.cucumber-not-in-shed-offers-add-plant_to_shed` | Mandatory rule fires | 🆕 |
| R2-098 | `chat.regression-22.0018-care-to-tasks.advice-offers-create-task-cta` | Mandatory rule fires after care advice | 🆕 |
| R2-099 | `chat.tool-call.read-only-tools-run-without-confirm` | `list_plants` executes silently | 🆕 |
| R2-100 | `chat.tool-call.confirm-tool.shows-card-and-Confirm-Cancel` | `add_plant_to_shed` shows confirmation UI | 🆕 |
| R2-101 | `chat.tool-call.confirm.success-shows-summary-and-affected-rows` | Done state with refs | 🆕 |
| R2-102 | `chat.tool-call.cancel.no-side-effects` | DB unchanged | 🆕 |
| R2-103 | `chat.tool-call.expired-after-30m-cannot-be-confirmed` | TTL guard | 🆕 |
| R2-104 | `chat.tool-call.destructive-tool.shows-stronger-confirm-language` | `delete_plant` requires extra confirmation | 🆕 |
| R2-105 | `chat.tool-call.undo-within-window.reverses-action` | Undo button reverses recent destructive op | 🆕 |
| R2-106 | `chat.voice.mic-press-captures-audio-and-sends-with-text` | Audio path attached as inlineData | 🆕 |
| R2-107 | `chat.voice.empty-text-with-audio-still-sends` | Audio-only turns supported | 🆕 |
| R2-108 | `chat.voice.over-7.5mb-audio-rejected` | Size cap respected | 🆕 |
| R2-109 | `chat.voice.speaker-icon-plays-reply-via-tts` | TTS playback fires | 🆕 |
| R2-110 | `chat.voice.auto-read-toggle-plays-every-reply` | Profile setting honored | 🆕 |
| R2-111 | `chat.quota.over-tier-cap-returns-429-and-shows-banner` | Sprout 5/day exhaustion | 🆕 |
| R2-112 | `chat.quota.banner-links-to-tier-upgrade` | Upgrade CTA in banner | 🆕 |

---

## R2.09 — Members & Permissions (full lifecycle)

ref: [`07-management/02-members-permissions.md`](../app-reference/07-management/02-members-permissions.md). Round 1 mentioned invite/permission/remove but missed the granular per-key permission editor and the 10 functional groups.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-113 | `members.list.shows-current-user-with-owner-chip` | Self labeled "You (Owner)" | 🆕 |
| R2-114 | `members.invite.copy-home-id-button-writes-clipboard` | Clipboard contains UUID | 🆕 |
| R2-115 | `members.invite.copy-shows-toast-confirmation` | UI confirmation | 🆕 |
| R2-116 | `members.role.change-to-editor-resets-permissions-to-editor-defaults` | Role default override | 🆕 |
| R2-117 | `members.role.change-to-viewer-makes-add-edit-buttons-disabled-elsewhere` | Verified on Shed | 🆕 |
| R2-118 | `members.role.owner-cannot-demote-self` | Self-role select disabled | 🆕 |
| R2-119 | `members.role.editor-cannot-edit-owner-row` | Permission editor hidden | 🆕 |
| R2-120 | `members.permission.shed.add-toggle-off-hides-add-button-on-shed-for-that-member` | Cross-page effect | 🆕 |
| R2-121 | `members.permission.tasks.delete_any-vs-delete_own-distinction-respected` | Other-member task hidden delete | 🆕 |
| R2-122 | `members.permission.audit.view_all-toggle-on-shows-audit-tab-for-that-member` | Tab visibility | 🆕 |
| R2-123 | `members.permission.toggle-persists-after-reload` | DB persistence | 🆕 |
| R2-124 | `members.permission.realtime-other-tab-applies-revocation-without-reload` | UI updates live | 🆕 |
| R2-125 | `members.remove.confirm-modal-and-removes-row` | Delete flow | 🆕 |
| R2-126 | `members.remove.cannot-remove-self-via-list` | Owner self-remove blocked | 🆕 |
| R2-127 | `members.remove.removes-user-also-clears-their-profile-home-id-if-this-was-active` | Cascade in `user_profiles` | 🆕 |
| R2-128 | `members.permission.10-groups-rendered-collapsed-by-default` | Each group is a collapsible section | 🆕 |
| R2-129 | `members.permission.group-expand-shows-each-key-as-checkbox` | Granular view | 🆕 |

### R2.10 — Multiple Homes (Round 1 had 2 lines)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-130 | `homes.dropdown.shows-all-homes-user-is-member-of` | Switcher lists all | 🆕 |
| R2-131 | `homes.dropdown.current-home-has-checkmark` | Active indicator | 🆕 |
| R2-132 | `homes.switch.clears-realtime-channels-and-resubscribes` | No cross-home data leak | 🆕 |
| R2-133 | `homes.switch.clears-localStorage-cache-keyed-by-prior-home` | Cache cleanup | 🆕 |
| R2-134 | `homes.add.opens-home-setup-with-hasExistingHome-true` | X cancel button visible | 🆕 |
| R2-135 | `homes.delete.owner-with-other-members-blocked-with-toast` | Cannot delete a populated home | 🆕 |
| R2-136 | `homes.delete.owner-sole-member-confirm-removes-home-and-cascades` | Full cascade | 🆕 |
| R2-137 | `homes.leave.member-non-owner-can-leave-from-self-row` | Leave-home flow | 🆕 |

---

## R2.11 — Notifications (channel-by-channel)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-138 | `notifs.toast.success-error-loading-distinct-styles` | Variants render | 🆕 |
| R2-139 | `notifs.browser.permission-granted-fires-Notification-on-event` | API-level test | 🆕 |
| R2-140 | `notifs.push.fcm-token-registered-on-grant` | `user_devices` row created | 🆕 |
| R2-141 | `notifs.push.fcm-token-removed-on-revoke` | Cleanup row | 🆕 |
| R2-142 | `notifs.push.regression-22.0017-high-priority-android-payload-includes-priority-HIGH` | Inspect outbound FCM body | 🆕 |
| R2-143 | `notifs.push.regression-22.0017-data-fields-coerced-to-strings` | Booleans/timestamps stringified | 🆕 |
| R2-144 | `notifs.category.watering-toggle-off-suppresses-push-but-keeps-in-app-row` | Channel-aware delivery | 🆕 |
| R2-145 | `notifs.category.golden-hour-toggle-off-keeps-cron-row-but-no-push` | Same | 🆕 |
| R2-146 | `notifs.category.weekly-overview-toggle-off-suppresses-sunday-push` | Same | 🆕 |
| R2-147 | `notifs.tap.deeplink-navigates-to-data.route` | Notification → route | 🆕 |
| R2-148 | `notifs.in-app.bell-icon-badge-count-matches-unread` | Header badge sync | 🆕 |
| R2-149 | `notifs.in-app.tap-row-marks-read-and-removes-from-badge` | Read state | 🆕 |

---

## R2.12 — Schedule / Blueprints (pause, seasonal restrict, tombstones)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-150 | `schedule.pause.until-date-suppresses-ghosts-in-range` | Engine respects `paused_until` | 🆕 |
| R2-151 | `schedule.pause.resume-restores-ghost-generation` | Resume works | 🆕 |
| R2-152 | `schedule.seasonal-restrict.start-month-end-month-clamps-ghosts` | Out-of-season days have no ghost | 🆕 |
| R2-153 | `schedule.tombstone.delete-single-day-task-without-checkbox-creates-skipped-tombstone` | Per-day skip | 🆕 |
| R2-154 | `schedule.tombstone.next-day-ghost-still-generated-correctly` | Dedup invariant | 🆕 |
| R2-155 | `schedule.ghost-id-format-matches-ghost-{bp}-{YYYY-MM-DD}` | Format contract | 🆕 |

---

## R2.13 — Calendar drag rules

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-156 | `calendar.drag.to-future-day-shifts-due-date` | Happy path | 🆕 |
| R2-157 | `calendar.drag.to-past-day-blocked-with-tooltip` | Past drop disallowed | 🆕 |
| R2-158 | `calendar.drag.blocked-task-cannot-be-dragged` | Dependency-locked task immobile | 🆕 |
| R2-159 | `calendar.drag.recurring-task-asks-this-only-vs-all-future` | Decision modal | 🆕 |
| R2-160 | `calendar.drag.recurring-shift-all-future-updates-blueprint-and-skips-past-completed` | Right semantics | 🆕 |
| R2-161 | `calendar.drag.window-task-not-draggable` | Window tasks fixed within their window | 🆕 |

---

## R2.14 — Optimise (each scenario type)

Round 1 had three scenarios; ref calls out five.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-162 | `optimise.scenario.fragmentation-merge` | Apply merges N blueprints into 1 | 🆕 |
| R2-163 | `optimise.scenario.redundant-archive` | Apply archives the duplicate | 🆕 |
| R2-164 | `optimise.scenario.frequency-change-applies-new-frequency` | Frequency tweak | 🆕 |
| R2-165 | `optimise.scenario.new-blueprint-creates-missing-care-task` | Adds suggested blueprint | 🆕 |
| R2-166 | `optimise.scenario.retire-archive-orphan` | No active instances → archive | 🆕 |
| R2-167 | `optimise.history.undo-restores-pre-apply-state-within-90d` | Undo window respected | 🆕 |
| R2-168 | `optimise.history.over-90d-undo-disabled` | Hard cap | 🆕 |
| R2-169 | `optimise.ai.tier-gate-sprout-shows-locked` | Lock state | 🆕 |
| R2-170 | `optimise.ai.over-quota-shows-banner` | Quota guard | 🆕 |

---

## R2.15 — Instance Edit Modal — every tab

ref: [`08-modals-and-overlays/08-instance-edit-modal.md`](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md). Round 1 had 6 tabs as one line each; the modal actually has 10 tabs.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-171 | `instance.tab.details-status-edit-saves` | Status dropdown writes to DB | 🆕 |
| R2-172 | `instance.tab.details.move-to-area-cascade-picker-saves` | Area change persists | 🆕 |
| R2-173 | `instance.tab.routines.add-blueprint-inline-creates-row` | Linked blueprint visible | 🆕 |
| R2-174 | `instance.tab.routines.remove-blueprint-confirms` | Unlink with confirm | 🆕 |
| R2-175 | `instance.tab.journal.add-entry-with-photo-uploads-and-renders` | End-to-end | 🆕 |
| R2-176 | `instance.tab.photos.tap-photo-opens-fullscreen-with-delete` | Lightbox + delete | 🆕 |
| R2-177 | `instance.tab.care-guide.renders-from-plant-data` | Read-only tab | 🆕 |
| R2-178 | `instance.tab.grow-guide.AI-generates-9-sections-once-cached` | Sage+ tab | 🆕 |
| R2-179 | `instance.tab.guides.shows-related-guides-list` | Guide hooks | 🆕 |
| R2-180 | `instance.tab.yield.add-harvest-amount-creates-yield-record` | Yield log | 🆕 |
| R2-181 | `instance.tab.yield.predictor-sage-only-shows-band` | Tier-gated predictor | 🆕 |
| R2-182 | `instance.tab.light.add-reading-saves-and-shows-band` | Light tab | 🆕 |
| R2-183 | `instance.tab.stats.completion-rate-and-streak-rendered` | Stats tab | 🆕 |
| R2-184 | `instance.tab.companions.list-shows-good-and-avoid` | Companions tab | 🆕 |

---

## R2.16 — Cross-cutting flows (additions)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R2-185 | `flow.invite.owner-shares-id-second-user-joins-and-sees-shared-data` | Multi-account flow using two workers | 🆕 |
| R2-186 | `flow.invite.viewer-role-cannot-edit-shared-plants` | Permission scoping | 🆕 |
| R2-187 | `flow.snooze.regression-from-22.0019-through-22.0027-snoozed-task-stays-hidden-overdue-counters-stay-clean-dot-moves` | One large regression covering the whole snooze story | 🆕 |
| R2-188 | `flow.rain-skip.regression-22.0024-skipped-rain-notification-also-marks-task-Skipped-with-reason` | Atomic with notification | 🆕 |
| R2-189 | `flow.chat.regression-22.0023-no-duplicate-replies-after-close-and-reopen` | Persistence regression | 🆕 |
| R2-190 | `flow.update.regression-22.0014-22.0020-check-for-update-reflects-actually-installs-new-bundle` | End-to-end SW reload | 🆕 |
| R2-191 | `flow.delete-account.deletes-everything-cascades-and-signs-out` | Self-delete | 🆕 |
| R2-192 | `flow.reset-account-data.regression-22.0017-admin-only-and-keeps-identity-fields` | Admin tool | 🆕 |

---

# Summary after Round 2

- Round 1 catalog: ~470 tests (~110 existing, ~360 new)
- Round 2 additions: +140 (R2-001 → R2-192, numbered with gaps for future inserts)
- **Total: ~610 tests, ~500 net-new**

Themes I still want to deep-dive on rounds 3+:

- **Plant Doctor identify/diagnose result interactions** — every action that's possible from a result tile (assign to instance, save with override, treat with shopping list link)
- **Garden Layout editor** — already partly covered through GLB-001..017 in the old plan; I want to confirm Wave 10+ coverage
- **Integrations / automations** — device flows, automation rule combinations (rain skip × heat trigger × manual run)
- **Wave-20 AI ripeness sheet** — separate flow with its own sub-states (loading, ripe/overripe/not yet verdict, error)
- **Plan staging Phase 2** — Shed match algorithm edge cases
- **Caching** — localStorage cache expiry, sessionStorage seasonal picks cache, dashboard v1 cache purge
- **Realtime** — every channel: tasks, blueprints, plants, notifications, presence, member changes
- **Mobile sub-routes** — `/quick/calendar`, `/quick/lens` (retired), `/walk`, deep links from notifications

Confirm direction and I'll keep digging — or, if this depth is enough on the high-value surfaces, we can stop here and start cutting these into the themed PRs.

---

# Deep-dive additions (Round 3) — every remaining area

User direction: *"keep digging until we've done every area"*. Round 3 sweeps every surface Rounds 1 and 2 either skipped or under-counted, taking the total to **~860 tests** (R3 adds ~250).

Numbering continues from R2-192 with `R3-XXX`. Where Round 1 or 2 already named a test I don't duplicate.

---

## R3.01 — Auth (deeper)

ref: [`01-onboarding/01-auth-screen.md`](../app-reference/01-onboarding/01-auth-screen.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-001 | `auth.magic-link.callback-with-valid-token-signs-in-and-redirects` | `/auth/callback?token=...` flow | 🆕 |
| R3-002 | `auth.magic-link.callback-expired-token-routes-to-login-with-banner` | TTL exceeded | 🆕 |
| R3-003 | `auth.email-confirmation.unconfirmed-account-shows-resend-banner-on-login` | Pre-confirm path | 🆕 |
| R3-004 | `auth.email-confirmation.resend-button-fires-and-shows-toast` | Resend handler | 🆕 |
| R3-005 | `auth.session.expired-jwt-mid-action-shows-re-login-toast-and-routes` | 401 from PostgREST while writing | 🆕 |
| R3-006 | `auth.session.refresh-token-rotation-happy-path` | Background refresh succeeds silently | 🆕 |
| R3-007 | `auth.session.concurrent-tab-sign-out-invalidates-other-tab` | Realtime presence on auth state | 🆕 |
| R3-008 | `auth.account.lockout-after-5-failed-attempts-shows-cooldown` | Brute-force guard | 🆕 |
| R3-009 | `auth.sign-out.clears-localStorage-rhozly-keys` | Storage cleanup contract | 🆕 |
| R3-010 | `auth.sign-out.clears-sessionStorage-rhozly-keys` | Same for sessionStorage | 🆕 |
| R3-011 | `auth.sign-out.removes-fcm-token-from-user_devices` | Push cleanup | 🆕 |
| R3-012 | `auth.deep-link.unauthenticated-visit-to-deep-link-redirects-back-after-login` | Post-login restore | 🆕 |
| R3-013 | `auth.oauth.google-callback-error-shows-banner` | Provider-side error surfaced | 🆕 |

---

## R3.02 — Daily Brief / AI Assistant cards

refs: [`02-dashboard/05-daily-brief-card.md`](../app-reference/02-dashboard/05-daily-brief-card.md), [`02-dashboard/06-assistant-card.md`](../app-reference/02-dashboard/06-assistant-card.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-014 | `daily-brief.hero.shows-greeting-and-headline-stat-of-the-day` | Empty data branch hidden | 🆕 |
| R3-015 | `daily-brief.weather-line.shows-rain-or-sun-icon-with-temp` | Weather-aware variant | 🆕 |
| R3-016 | `daily-brief.task-line.shows-top-priority-task-with-tap-target` | Tap opens task modal | 🆕 |
| R3-017 | `daily-brief.empty-account.shows-getting-started-prompt` | New-user variant | 🆕 |
| R3-018 | `ai-assistant.insights.shows-top-3-user_insights-rows` | Empty when none | 🆕 |
| R3-019 | `ai-assistant.insight.tap-acknowledge-dismisses-locally-and-server-side` | `user_insights.acknowledged_at` set | 🆕 |
| R3-020 | `ai-assistant.insight.tap-route-link-navigates-correctly` | Insight CTA route | 🆕 |
| R3-021 | `ai-assistant.tier.sprout-shows-locked-card-with-upgrade-cta` | Tier gating | 🆕 |
| R3-022 | `ai-assistant.refresh.button-fetches-fresh-insights-and-shows-spinner` | Manual refresh | 🆕 |

---

## R3.03 — Location Page (drill-in)

ref: [`02-dashboard/07-location-page.md`](../app-reference/02-dashboard/07-location-page.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-023 | `location-page.url.invalid-locationId-shows-not-found` | Bad query param branch | 🆕 |
| R3-024 | `location-page.url.location-from-other-home-blocked-by-RLS-shows-not-found` | Cross-home guard | 🆕 |
| R3-025 | `location-page.areas.tap-area-card-opens-area-details-modal` | Drill-in second hop | 🆕 |
| R3-026 | `location-page.tasks.today-filter-respects-this-location-only` | Scope verified | 🆕 |
| R3-027 | `location-page.weather.shows-this-locations-snapshot-when-outdoor` | Outdoor vs indoor branch | 🆕 |
| R3-028 | `location-page.weather.hidden-when-indoor-location` | Indoor variant | 🆕 |
| R3-029 | `location-page.back-button.returns-to-dashboard-tab-not-/` | History pop semantics | 🆕 |

---

## R3.04 — Weather Alert Banner (multi-state)

ref: [`02-dashboard/08-weather-alert-banner.md`](../app-reference/02-dashboard/08-weather-alert-banner.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-030 | `weather-alert.frost.severity-info-warning-critical-render-with-correct-colour` | Three severity tones | 🆕 |
| R3-031 | `weather-alert.multi.frost-and-heatwave-stack-with-rotator` | Banner cycles 3s each | 🆕 |
| R3-032 | `weather-alert.dismiss.tap-x-hides-until-next-alert-batch` | Soft dismissal | 🆕 |
| R3-033 | `weather-alert.expiry.regression-21.0004-banner-clears-24h-after-event` | Auto-expiry | 🆕 |
| R3-034 | `weather-alert.tap.frost-cta-routes-to-weather-tab` | Deep link | 🆕 |
| R3-035 | `weather-alert.tap.wind-cta-routes-to-management-secure-things` | Wind path | 🆕 |
| R3-036 | `weather-alert.no-postcode.banner-suppressed-and-empty-state-card-shown` | Missing geo guard | 🆕 |

---

## R3.05 — Garden Walk (deeper)

ref: [`02-dashboard/13-garden-walk.md`](../app-reference/02-dashboard/13-garden-walk.md). Round 1 had skeleton.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-037 | `walk.start.session-row-inserted-with-startedAt` | DB row contract | 🆕 |
| R3-038 | `walk.list.respects-same-day-visited-filter-on-walk-again` | Skipped plants surface first | 🆕 |
| R3-039 | `walk.snap.uses-native-camera-on-capacitor` | Native branch | 🆕 |
| R3-040 | `walk.snap.fallback-to-html-input-on-web` | Web branch | 🆕 |
| R3-041 | `walk.snap.uploads-photo-to-walk-photos-bucket` | Storage path | 🆕 |
| R3-042 | `walk.note.input-min-1-char-max-280-enforced` | Boundary | 🆕 |
| R3-043 | `walk.all-good.does-not-create-journal-entry` | No side effect | 🆕 |
| R3-044 | `walk.flag-ailment.creates-watchlist-row-and-links-instance` | Cross-feature wire | 🆕 |
| R3-045 | `walk.skip.row-recorded-with-skip-reason` | Skip metadata | 🆕 |
| R3-046 | `walk.stop.endSession-fired-and-summary-counts-correct` | Stop transition | 🆕 |
| R3-047 | `walk.summary.zero-progress-shows-empty-summary-not-error` | Edge state | 🆕 |
| R3-048 | `walk.realtime.companion-walk-by-other-member-not-shown` | Per-user session scope | 🆕 |

---

## R3.06 — Weekly Overview (per section)

ref: [`02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-049 | `weekly.tasks-section.empty-state-shows-no-tasks-this-week` | Empty branch | 🆕 |
| R3-050 | `weekly.weather-events.tap-row-jumps-to-day-on-calendar` | Cross-link | 🆕 |
| R3-051 | `weekly.sowings.regression-tasks-link-to-nursery-tab` | Routes correctly | 🆕 |
| R3-052 | `weekly.harvest-windows.opening-this-week-row-tap-opens-task-modal` | Cross-link | 🆕 |
| R3-053 | `weekly.prune-windows.opening-this-week-similar-link` | Cross-link | 🆕 |
| R3-054 | `weekly.ai-tips.gemini-error-falls-back-to-deterministic` | Fallback path | 🆕 |
| R3-055 | `weekly.pest-disease-risk.row-shows-action-cta` | Risk cards | 🆕 |
| R3-056 | `weekly.pollen.daily-bars-render-with-level-colour` | Pollen days | 🆕 |
| R3-057 | `weekly.regenerate.sage-button-fires-edge-function-and-replaces-row` | On-demand regen | 🆕 |
| R3-058 | `weekly.regenerate.sage-button-disabled-during-in-flight-call` | Loading guard | 🆕 |
| R3-059 | `weekly.regenerate.non-sage-button-shows-locked-state` | Tier-gated | 🆕 |
| R3-060 | `weekly.notification.tap-overview-push-lands-on-weekly-page-with-correct-week` | Deep link | 🆕 |

---

## R3.07 — The Shed (deeper — search, multi-select, bulk)

ref: [`03-garden-hub/01-the-shed.md`](../app-reference/03-garden-hub/01-the-shed.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-061 | `shed.search.debounce-waits-300ms-before-query` | Input debouncing | 🆕 |
| R3-062 | `shed.search.special-chars-do-not-crash-postgrest` | Escape behaviour | 🆕 |
| R3-063 | `shed.multi-select.long-press-enters-select-mode` | Selection toolbar | 🆕 |
| R3-064 | `shed.multi-select.select-all-respects-active-filter` | Filter-aware | 🆕 |
| R3-065 | `shed.multi-select.bulk-archive-confirms-with-count` | Bulk archive | 🆕 |
| R3-066 | `shed.multi-select.bulk-assign-opens-bulk-assign-modal` | Modal launch | 🆕 |
| R3-067 | `shed.multi-select.bulk-delete-blocked-when-instances-exist-without-cascade-confirm` | Safety guard | 🆕 |
| R3-068 | `shed.pagination.scroll-to-bottom-loads-next-page` | Lazy load | 🆕 |
| R3-069 | `shed.image.lazy-load-uses-image-proxy-and-respects-cache` | Image proxy contract | 🆕 |

---

## R3.08 — Watchlist editor sub-flows

ref: [`03-garden-hub/02-watchlist.md`](../app-reference/03-garden-hub/02-watchlist.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-070 | `watchlist.editor.add-step-creates-empty-row-at-end` | Step add | 🆕 |
| R3-071 | `watchlist.editor.reorder-drag-handle-moves-step` | DnD | 🆕 |
| R3-072 | `watchlist.editor.delete-step-confirms-when-step-has-task` | Cascade guard | 🆕 |
| R3-073 | `watchlist.editor.symptom-tracker.location-on-plant-options-7-presets-and-custom` | Symptom dropdown | 🆕 |
| R3-074 | `watchlist.editor.product-field.auto-suggests-from-perenual-results` | Product auto-complete | 🆕 |
| R3-075 | `watchlist.editor.frequency.zero-blocks-save` | Min frequency | 🆕 |
| R3-076 | `watchlist.editor.duration.max-365-days-allowed` | Boundary | 🆕 |
| R3-077 | `watchlist.create-task-from-step.recurring-step-creates-blueprint` | Step → blueprint | 🆕 |
| R3-078 | `watchlist.create-task-from-step.one-off-step-creates-single-task` | Step → task | 🆕 |
| R3-079 | `watchlist.link-instance.modal-cascade-location-area-plant-instance` | Instance picker | 🆕 |

---

## R3.09 — Area Details + Microclimate Report

refs: [`03-garden-hub/04-area-details.md`](../app-reference/03-garden-hub/04-area-details.md), [`03-garden-hub/07-microclimate-report.md`](../app-reference/03-garden-hub/07-microclimate-report.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-080 | `area-details.shows-metrics-and-plant-grid` | Card rendering | 🆕 |
| R3-081 | `area-details.plant-grid.tap-opens-instance-edit-modal` | Drill-in | 🆕 |
| R3-082 | `area-details.tasks-tab.today-task-list-filtered-to-area` | Filter | 🆕 |
| R3-083 | `area-details.layout-link.routes-to-layout-editor-on-this-area` | Cross-link | 🆕 |
| R3-084 | `microclimate.report.opens-modal-from-area-card-info-icon` | Modal entry | 🆕 |
| R3-085 | `microclimate.report.shows-sun-wind-frost-rollup` | Section rendering | 🆕 |
| R3-086 | `microclimate.report.missing-lux-shows-add-reading-cta` | Empty branch | 🆕 |

---

## R3.10 — Garden Layout Editor — Wave 10+ smart-map polish

ref: [`03-garden-hub/06-garden-layout-editor.md`](../app-reference/03-garden-hub/06-garden-layout-editor.md). The old plan covered through Wave 1; Waves 7–12 still need coverage.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-087 | `layout.smart-map.snap-to-grid-cell-when-dragging-shape` | Snap-on-drag | 🆕 |
| R3-088 | `layout.smart-map.long-press-shape-shows-context-menu` | Mobile menu | 🆕 |
| R3-089 | `layout.smart-map.multi-select-marquee-and-bulk-rotate` | Marquee + group ops | 🆕 |
| R3-090 | `layout.right-click.opens-context-menu-on-desktop` | Desktop menu | 🆕 |
| R3-091 | `layout.zones.create-and-tag-zone-shows-zone-tint` | Zones | 🆕 |
| R3-092 | `layout.templates.apply-template-fills-empty-canvas` | Template insert | 🆕 |
| R3-093 | `layout.north.compass-sheet-rotates-overlay` | North sheet | 🆕 |
| R3-094 | `layout.export.svg-button-downloads-vector` | Export | 🆕 |
| R3-095 | `layout.export.png-button-downloads-raster` | Export PNG | 🆕 |
| R3-096 | `layout.starter-layouts.preset-veg-patch-loads-with-named-zones` | Preset | 🆕 |

---

## R3.11 — Sun Tracker AR (deeper)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-097 | `sun-tracker.slider.dragging-shifts-marker-and-shadow-overlay` | Time slider drag | 🆕 |
| R3-098 | `sun-tracker.sunrise-sunset.markers-rendered-at-correct-positions` | Anchors | 🆕 |
| R3-099 | `sun-tracker.seasonal.toggle-shows-winter-and-summer-paths-overlay` | Seasonal compare | 🆕 |
| R3-100 | `sun-tracker.gyro.denied-uses-manual-rotation-controls` | Permission fallback | 🆕 |
| R3-101 | `sun-tracker.location-permission.denied-uses-home-coords-as-fallback` | Location fallback | 🆕 |
| R3-102 | `sun-tracker.save.snapshot-button-stores-image-to-captures` | Save flow | 🆕 |

---

## R3.12 — Light Sensor calibration

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-103 | `lightsensor.calibration.factor-slider-0.1-to-2.0-clamps-extremes` | Slider boundary | 🆕 |
| R3-104 | `lightsensor.calibration.saved-locally-and-persists-across-reload` | localStorage contract | 🆕 |
| R3-105 | `lightsensor.calibration.exposure-comp-only-shown-in-pixel-mode` | Conditional control | 🆕 |
| R3-106 | `lightsensor.compare.linked-plant-shows-band-match-or-mismatch-chip` | Plant comparison | 🆕 |
| R3-107 | `lightsensor.history.last-10-readings-rendered-on-list` | History rendering | 🆕 |

---

## R3.13 — Nursery full lifecycle (deeper)

ref: [`03-garden-hub/10-nursery.md`](../app-reference/03-garden-hub/10-nursery.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-108 | `nursery.packet.expired-sow-by-shows-amber-badge` | Visual state | 🆕 |
| R3-109 | `nursery.packet.duplicate-species-warns-on-add` | Duplicate guard | 🆕 |
| R3-110 | `nursery.sow.date-in-future-allowed-stores-as-planned` | Forward planning | 🆕 |
| R3-111 | `nursery.sow.quantity-max-9999-clamps-input` | Max | 🆕 |
| R3-112 | `nursery.sow.container-or-area-picker-cascade-or-freeform` | Picker behaviour | 🆕 |
| R3-113 | `nursery.germinate.success-rate-input-percentage-0-to-100` | Percent boundary | 🆕 |
| R3-114 | `nursery.germinate.zero-percent-marks-sowing-failed` | Failure path | 🆕 |
| R3-115 | `nursery.plant-out.quantity-defaults-to-germinated-count` | Default value | 🆕 |
| R3-116 | `nursery.plant-out.create-shed-instances-toggle-on-creates-rows` | Cross-feature wire | 🆕 |
| R3-117 | `nursery.plant-out.create-shed-instances-toggle-off-keeps-nursery-only` | Optional path | 🆕 |
| R3-118 | `nursery.queue.empty-state-shows-when-no-active-sowings` | Empty branch | 🆕 |
| R3-119 | `nursery.calendar.tap-month-cell-shows-rows-for-that-month` | Month drill | 🆕 |
| R3-120 | `nursery.calendar.hemisphere-rolls-southern-windows-for-southern-account` | Seasonality | 🆕 |
| R3-121 | `nursery.scan-packet.ai-failure-falls-back-to-manual-form-with-banner` | AI fallback | 🆕 |

---

## R3.14 — Global Journal (auto-update, filters)

ref: [`03-garden-hub/11-global-journal.md`](../app-reference/03-garden-hub/11-global-journal.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-122 | `journal.auto-update.task-complete-creates-journal-entry-when-toggle-on` | Profile toggle | 🆕 |
| R3-123 | `journal.auto-update.toggle-off-suppresses-auto-entry` | Suppression | 🆕 |
| R3-124 | `journal.auto-update.category-mapping-watering-to-water-category` | Category contract | 🆕 |
| R3-125 | `journal.filter.by-multiple-targets-OR-semantics` | Multi-filter | 🆕 |
| R3-126 | `journal.target-picker.cascade-location-area-plant-instance-plan` | Picker tree | 🆕 |
| R3-127 | `journal.entry.unassigned-target-allowed-and-rendered-as-loose` | Polymorphic target | 🆕 |
| R3-128 | `journal.entry.photo-upload-rotates-EXIF-correctly` | Image handling | 🆕 |

---

## R3.15 — Senescence

ref: [`03-garden-hub/12-senescence.md`](../app-reference/03-garden-hub/12-senescence.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-129 | `senescence.filter.natural-vs-other-reason-narrows-list` | Filter | 🆕 |
| R3-130 | `senescence.restore.regenerates-routine-blueprints-and-undoes-end_of_life` | Cross-feature side effect | 🆕 |
| R3-131 | `senescence.delete-permanent.confirm-removes-row-and-archives-related` | Hard delete | 🆕 |
| R3-132 | `senescence.lifecycle-end.AI-cause-analysis-sage-only-button` | Tier gate | 🆕 |

---

## R3.16 — Notes — rich text + linking

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-133 | `notes.editor.heading-shortcut-#-converts-to-h1` | Markdown shortcuts | 🆕 |
| R3-134 | `notes.editor.checkbox-list-tap-toggles-state` | Checkbox interactivity | 🆕 |
| R3-135 | `notes.editor.table.add-and-edit-rows-and-columns` | Table editor | 🆕 |
| R3-136 | `notes.editor.image-paste-uploads-to-notes-bucket` | Paste handling | 🆕 |
| R3-137 | `notes.editor.link.https-auto-detected-and-linkified` | URL auto-detect | 🆕 |
| R3-138 | `notes.editor.undo-redo.ctrl-z-and-ctrl-y` | Editor history | 🆕 |
| R3-139 | `notes.cross-page.note-linked-to-plant-shows-on-plant-modal-notes-tab` | Cross-page link | 🆕 |
| R3-140 | `notes.cross-page.note-linked-to-area-shows-on-area-details-notes-section` | Cross-page link | 🆕 |
| R3-141 | `notes.cross-page.note-linked-to-plan-shows-on-plan-page-notes-rail` | Cross-page link | 🆕 |
| R3-142 | `notes.realtime.delete-by-member-removes-from-grid-without-reload` | Realtime | 🆕 |

---

## R3.17 — Planner Plan Staging (each phase, deeper)

ref: [`04-planner/02-plan-staging.md`](../app-reference/04-planner/02-plan-staging.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-143 | `plan-staging.phase1.area-required-cannot-advance-without-area` | Phase gate | 🆕 |
| R3-144 | `plan-staging.phase2.in-shed-match-exact-name-and-scientific-name` | Match algo | 🆕 |
| R3-145 | `plan-staging.phase2.in-shed-match-quantity-less-shows-need-more-pill` | Quantity gap | 🆕 |
| R3-146 | `plan-staging.phase2.add-to-shopping-list.creates-new-list-if-none` | New list branch | 🆕 |
| R3-147 | `plan-staging.phase2.add-to-shopping-list.appends-to-existing-active-list` | Append branch | 🆕 |
| R3-148 | `plan-staging.phase3.task-list.add-custom-task-saves-as-blueprint` | Custom task | 🆕 |
| R3-149 | `plan-staging.phase3.task-list.reorder-by-drag-persists` | Drag persistence | 🆕 |
| R3-150 | `plan-staging.phase3.stage-tasks-confirms-with-count-and-creates-bps` | Confirm modal | 🆕 |
| R3-151 | `plan-staging.phase4.execution.progress-bar-reflects-completed-tasks-against-staged-total` | Progress arithmetic | 🆕 |
| R3-152 | `plan-staging.phase4.mark-plan-complete-cta-when-all-tasks-done` | Completion CTA | 🆕 |
| R3-153 | `plan-staging.phase5.maintenance.recurring-bps-honor-frequency-and-season` | Phase 5 contract | 🆕 |

### R3.18 — Plan Reference Photos

ref: [`04-planner/03-plan-reference-photos.md`](../app-reference/04-planner/03-plan-reference-photos.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-154 | `plan-photos.upload-multiple-files-shows-thumbnail-grid` | Bulk upload | 🆕 |
| R3-155 | `plan-photos.reorder.drag-changes-display-order` | Order persistence | 🆕 |
| R3-156 | `plan-photos.delete.x-removes-from-grid-and-storage` | Cascade to bucket | 🆕 |
| R3-157 | `plan-photos.fullscreen.tap-shows-lightbox` | Lightbox open | 🆕 |
| R3-158 | `plan-photos.max-10mb-rejected-with-toast` | Size cap | 🆕 |

---

## R3.19 — Garden Overhaul (Sage+)

ref: [`04-planner/09-garden-overhaul.md`](../app-reference/04-planner/09-garden-overhaul.md). Round 1 had two lines; this is the full Sage flow.

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-159 | `overhaul.input.photo-required-blocks-submit` | Validation | 🆕 |
| R3-160 | `overhaul.input.likes-dislikes-wants-fields-min-3-chars-each` | Text minimums | 🆕 |
| R3-161 | `overhaul.input.aesthetic-dropdown-shows-modern-cottage-wildlife-mediterranean` | Option set | 🆕 |
| R3-162 | `overhaul.input.image-quality-toggle-changes-imagen-tier` | Param wire | 🆕 |
| R3-163 | `overhaul.input.concept-count-default-3-can-be-set-2-or-4` | Count param | 🆕 |
| R3-164 | `overhaul.submit.returns-202-and-shows-result-view-loading-state` | Async flow | 🆕 |
| R3-165 | `overhaul.result.poll-every-4s-until-concepts-appear` | Polling cadence | 🆕 |
| R3-166 | `overhaul.result.three-concepts-shown-side-by-side-with-radio-pick` | Radio selection | 🆕 |
| R3-167 | `overhaul.result.pick-stores-selected_by_user-flag-server-side` | Server state | 🆕 |
| R3-168 | `overhaul.feedback.thumbs-up-stores-rating-row-once-per-user-per-plan` | One vote | 🆕 |
| R3-169 | `overhaul.feedback.free-text-comment-saves` | Optional comment | 🆕 |
| R3-170 | `overhaul.tier-gate.sprout-shows-locked-placeholder-with-upgrade-link` | Locked state | 🆕 |
| R3-171 | `overhaul.rate-limit.over-3-per-hour-sage-shows-banner` | Rate limit | 🆕 |
| R3-172 | `overhaul.failure.all-3-imagen-calls-fail-shows-retry-cta-and-plan-status-Failed` | Total failure | 🆕 |

---

## R3.20 — Shopping Lists (multi-list + flow)

ref: [`04-planner/05-shopping-lists.md`](../app-reference/04-planner/05-shopping-lists.md), [`06-shopping-list-items.md`](../app-reference/04-planner/06-shopping-list-items.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-173 | `shopping.multi-list.reorder-lists-via-drag-persists` | Order | 🆕 |
| R3-174 | `shopping.list.archive-from-completed-section-removes-from-default-view` | Archive bin | 🆕 |
| R3-175 | `shopping.item.qty-stepper-min-1-max-99` | Qty boundary | 🆕 |
| R3-176 | `shopping.item.product-category-dropdown-shows-12-categories` | Option set | 🆕 |
| R3-177 | `shopping.item.notes-field-280-char-max` | Text max | 🆕 |
| R3-178 | `shopping.add.unified-search-AI-tile-shows-add-and-care-guide-actions` | AI result tile | 🆕 |
| R3-179 | `shopping.add.unified-search.empty-query-shows-trending-suggestions` | Empty UX | 🆕 |
| R3-180 | `shopping.add.unified-search.error-from-provider-shows-banner-and-keeps-cached-results` | Provider outage | 🆕 |

---

## R3.21 — Blueprint Manager (deeper)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-181 | `schedule.bulk.select-3-pause-all-sets-paused_until` | Bulk pause | 🆕 |
| R3-182 | `schedule.bulk.select-3-archive-all-confirms` | Bulk archive | 🆕 |
| R3-183 | `schedule.dup.duplicate-blueprint-creates-new-row-with-_copy-suffix` | Duplicate action | 🆕 |
| R3-184 | `schedule.dependencies.add-blueprint-dependency-blocks-instances` | BP deps | 🆕 |
| R3-185 | `schedule.smart-suggest.AI-button-sage-only-suggests-frequency` | Tier-gated suggest | 🆕 |

---

## R3.22 — Tools Hub state

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-186 | `tools-hub.tile.locked-tier-shows-padlock-and-tooltip` | Lock state | 🆕 |
| R3-187 | `tools-hub.tile.beta-flag-shows-BETA-chip-when-is_beta-true` | Beta tag | 🆕 |
| R3-188 | `tools-hub.tile.disabled-when-no-plants-shows-empty-shed-cta` | Pre-requirement | 🆕 |

---

## R3.23 — Plant Doctor result tile interactions

ref: [`05-tools/02-plant-doctor.md`](../app-reference/05-tools/02-plant-doctor.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-189 | `lens.result.identify.confidence-very-likely-shows-green-chip` | Confidence band UI | 🆕 |
| R3-190 | `lens.result.identify.confidence-possible-shows-amber-chip` | Mid-band | 🆕 |
| R3-191 | `lens.result.identify.assign-to-instance-cascade-picker-saves` | Assign action | 🆕 |
| R3-192 | `lens.result.identify.override-rename-saves-as-manual-source` | Manual override | 🆕 |
| R3-193 | `lens.result.identify.cc-by-sa-badge-popover-shows-contributor-name-and-link` | Credit popover | 🆕 |
| R3-194 | `lens.result.diagnose.severity-low-medium-high-shown-with-icon` | Severity chip | 🆕 |
| R3-195 | `lens.result.diagnose.create-treatment-plan-cta-creates-plan-rows` | Treatment plan | 🆕 |
| R3-196 | `lens.result.diagnose.add-supplies-button-creates-shopping-rows` | Supply link | 🆕 |
| R3-197 | `lens.result.pest.identify-and-recommend-trap-or-spray-actions` | Pest result tile | 🆕 |
| R3-198 | `lens.history.session-detail.confirm-button-marks-session-completed` | Detail action | 🆕 |
| R3-199 | `lens.history.session-detail.shows-tasks-created-from-this-session` | Cross-link | 🆕 |
| R3-200 | `lens.history.filter.date-range-narrows-list` | Filter | 🆕 |
| R3-201 | `lens.history.filter.entity-type-plant-vs-disease-vs-pest` | Filter | 🆕 |
| R3-202 | `lens.upload.multi-image.up-to-5-photos-uploaded-together` | Multi-upload | 🆕 |
| R3-203 | `lens.upload.organ-tagging.user-selects-leaf-stem-flower-fruit` | Wave 19 organ tags | 🆕 |
| R3-204 | `lens.upload.heic-conversion-on-iOS-Safari-works` | Format conversion | 🆕 |

---

## R3.24 — Visualiser / Sprite Wizard / Capture Gallery

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-205 | `visualiser.empty-plants.shows-go-to-shed-cta` | Empty state | 🆕 |
| R3-206 | `visualiser.source-filter.all-vs-manual-vs-ai-narrows` | Filter | 🆕 |
| R3-207 | `sprite.source.unsplash-search-returns-hits-with-credit` | Source path | 🆕 |
| R3-208 | `sprite.source.perenual-uses-cached-image` | Source path | 🆕 |
| R3-209 | `sprite.source.existing-photo-from-plant-gallery` | Source path | 🆕 |
| R3-210 | `sprite.upload.removes-background-via-AI` | BG removal | 🆕 |
| R3-211 | `sprite.upload.AI-failure-falls-back-to-default-silhouette` | Fallback | 🆕 |
| R3-212 | `visualiser.camera.permission-denied-shows-fallback-2d-canvas` | Permission fallback | 🆕 |
| R3-213 | `visualiser.camera.flip-camera-button-toggles-front-and-back` | Camera control | 🆕 |
| R3-214 | `visualiser.ai-analysis.summary-and-per-plant-results-render` | Result panel | 🆕 |
| R3-215 | `visualiser.ai-analysis.dismiss-clears-panel-and-allows-rerun` | Re-run flow | 🆕 |
| R3-216 | `capture.gallery.delete-removes-from-grid-and-storage` | Cascade delete | 🆕 |
| R3-217 | `capture.gallery.fullscreen.swipe-changes-snapshot` | Lightbox swipe | 🆕 |

---

## R3.25 — Guides — App Help AI

ref: [`05-tools/07-guides-list.md`](../app-reference/05-tools/07-guides-list.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-218 | `app-help.ask.example-question-chips-populate-input-and-submit` | Quick-start | 🆕 |
| R3-219 | `app-help.ask.answer-includes-doc-section-link-citations` | Citation render | 🆕 |
| R3-220 | `app-help.ask.rate-limit-shows-quota-banner` | Rate limit | 🆕 |
| R3-221 | `app-help.ask.followup-uses-history-context` | Multi-turn | 🆕 |

---

## R3.26 — Companion Planting (deeper)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-222 | `companions.good-with.tap-name-opens-plant-detail-modal` | Cross-link | 🆕 |
| R3-223 | `companions.avoid.shows-reason-on-hover-or-tap` | Reason text | 🆕 |
| R3-224 | `companions.add-to-plan.choose-existing-plan-vs-new-plan` | Plan picker | 🆕 |
| R3-225 | `companions.area-filter.greenhouse-only-narrows-pairs` | Area filter | 🆕 |
| R3-226 | `companions.empty.no-plants-in-shed-shows-add-plants-cta` | Empty state | 🆕 |

---

## R3.27 — Account misc (deeper) — Profile Dropdown / Awards / Stats / Data Export

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-227 | `profile-dropdown.item.what-is-new-opens-release-notes-modal` | Dropdown item | 🆕 |
| R3-228 | `profile-dropdown.item.check-for-update-honors-22.0014-22.0020-flow` | Update flow regression hook | 🆕 |
| R3-229 | `profile-dropdown.item.help-opens-help-center-drawer` | Drawer launch | 🆕 |
| R3-230 | `profile-dropdown.item.privacy-and-cookies-open-respective-modals` | Modal launches | 🆕 |
| R3-231 | `profile-dropdown.item.log-out-clears-and-redirects` | Sign-out | 🆕 |
| R3-232 | `awards.unlocked-tap-opens-detail-with-criteria` | Award detail | 🆕 |
| R3-233 | `awards.locked-tap-shows-progress-to-unlock` | Progress hint | 🆕 |
| R3-234 | `awards.fired-event-shows-confetti-and-toast-once-per-unlock` | First-unlock UX | 🆕 |
| R3-235 | `stats.member-breakdown.shows-per-member-completed-counts` | Per-member rollup | 🆕 |
| R3-236 | `stats.range.30d-vs-90d-vs-all-changes-numbers` | Range filter | 🆕 |
| R3-237 | `data-export.zip-contains-known-csv-and-jsonl-files` | Archive contract | 🆕 |
| R3-238 | `data-export.large-export-shows-in-progress-toast-and-completes` | Long-running export | 🆕 |
| R3-239 | `data-export.over-quota-rate-limit-show-retry-after` | Rate limit | 🆕 |

---

## R3.28 — Home Management — Climate, Integrations, Audit

### Climate Settings

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-240 | `climate.frost-dates.first-and-last-date-pickers-save` | Frost UI | 🆕 |
| R3-241 | `climate.hardiness-zone.dropdown-or-auto-detect-toggle` | Zone editor | 🆕 |
| R3-242 | `climate.rainfall.monthly-avg-table-12-rows-editable` | Monthly grid | 🆕 |
| R3-243 | `climate.override.changes-propagate-to-seasonal-picks-and-weekly-overview` | Cross-feature | 🆕 |

### Integrations — Devices

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-244 | `devices.add.shelly.credential-validation-pings-and-confirms` | Vendor test | 🆕 |
| R3-245 | `devices.add.tasmota.credential-validation` | Vendor test | 🆕 |
| R3-246 | `devices.add.zigbee-bridge.shows-pairing-mode-button` | Pairing UX | 🆕 |
| R3-247 | `devices.list.online-vs-offline-state-chip` | Online state | 🆕 |
| R3-248 | `devices.control.fire-valve-button-sends-command-and-shows-toast` | Manual control | 🆕 |
| R3-249 | `devices.permissions.integrations-control-permission-required-to-fire` | RBAC | 🆕 |

### Integrations — Automations

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-250 | `automation.create.schedule-15-min-min-frequency` | Min cadence | 🆕 |
| R3-251 | `automation.create.duration-1-to-3600-seconds-bounds` | Duration bounds | 🆕 |
| R3-252 | `automation.create.fire-valves-sequentially-toggle-affects-vendor-call` | Sequential mode | 🆕 |
| R3-253 | `automation.create.retry-on-failure-retries-up-to-3` | Retry semantics | 🆕 |
| R3-254 | `automation.create.skip-if-rained-and-trigger-if-hot-can-both-be-on` | Rule combo | 🆕 |
| R3-255 | `automation.run-now.button-fires-and-creates-automation_runs-row` | Manual run | 🆕 |
| R3-256 | `automation.history.shows-last-30-runs-with-status-chip` | History | 🆕 |
| R3-257 | `automation.history.tap-row-shows-detail-with-rain-mm-and-task-touched` | Run detail | 🆕 |

### Audit Log

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-258 | `audit.range-default.last-30-days` | Default range | 🆕 |
| R3-259 | `audit.filter.by-user-id-narrows-rows` | User filter | 🆕 |
| R3-260 | `audit.filter.by-function-name-narrows` | Fn filter | 🆕 |
| R3-261 | `audit.column.prompt-tokens-completion-tokens-total-tokens` | Three columns visible | 🆕 |
| R3-262 | `audit.cost.calc-matches-prompt-times-rate-plus-completion-times-rate` | Math check | 🆕 |
| R3-263 | `audit.csv-export.button-downloads-rows` | Export | 🆕 |
| R3-264 | `audit.mobile.tokens-columns-merge-into-single-tokens` | Mobile layout | 🆕 |

---

## R3.29 — Modal deep-dive: Source Picker, Bulk Search, Wiki Picker, Photo tools, Help Center

### Plant Source Picker

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-265 | `source-picker.tiles.library-pl@ntnet-perenual-verdantly-ai-create-manual` | Six sources | 🆕 |
| R3-266 | `source-picker.tile.pl@ntnet-routes-to-camera` | Pl@ntNet path | 🆕 |
| R3-267 | `source-picker.tile.perenual-tier-gated-shows-lock-for-sprout` | Tier lock | 🆕 |
| R3-268 | `source-picker.tile.ai-create-tier-gated-sage-plus` | Tier lock | 🆕 |
| R3-269 | `source-picker.tile.manual-routes-to-manual-creation-form` | Manual path | 🆕 |

### Bulk Search Modal

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-270 | `bulk-search.queue.shows-pending-processing-success-error-states-per-row` | State machine | 🆕 |
| R3-271 | `bulk-search.queue.success-row-toast-shows-link-to-shed` | Toast link | 🆕 |
| R3-272 | `bulk-search.queue.error-row-shows-retry-button` | Retry | 🆕 |
| R3-273 | `bulk-search.queue.cancel-pending-aborts-and-removes-row` | Cancel | 🆕 |
| R3-274 | `bulk-search.paste.over-50-lines-shows-truncation-warning-and-processes-first-50` | Cap | 🆕 |

### Wiki Image Picker

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-275 | `wiki-picker.search.disambiguation-page-shows-candidate-list` | Disambig | 🆕 |
| R3-276 | `wiki-picker.pick-image.attaches-and-stores-attribution` | Attribution stored | 🆕 |
| R3-277 | `wiki-picker.no-results.shows-empty-state` | Empty branch | 🆕 |

### Photo tools

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-278 | `photo-uploader.drag-and-drop-on-desktop-uploads` | DnD UX | 🆕 |
| R3-279 | `photo-uploader.multi-file.up-to-10-files-allowed` | Cap | 🆕 |
| R3-280 | `photo-annotation.tools.arrow-and-text-and-rect-render` | Tool palette | 🆕 |
| R3-281 | `photo-annotation.save-stores-overlay-as-separate-image` | Overlay separate | 🆕 |
| R3-282 | `photo-annotation.undo-redo` | History | 🆕 |
| R3-283 | `multi-image-gallery.swipe-changes-image-and-shows-counter` | Swipe UX | 🆕 |
| R3-284 | `multi-image-gallery.delete-confirms-and-removes` | Delete | 🆕 |
| R3-285 | `diagnosis-gallery.confidence-chip-tap-shows-explanation-popover` | Confidence detail | 🆕 |

### Help Center Drawer

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-286 | `help-center.drawer.tabs-docs-walkthroughs-shortcuts-contact-render` | Tab inventory | 🆕 |
| R3-287 | `help-center.docs.search-narrows-doc-list` | Docs search | 🆕 |
| R3-288 | `help-center.walkthroughs.start-tour-fires-shepherd-flow` | Replay tour | 🆕 |
| R3-289 | `help-center.walkthroughs.completed-flows-show-replay-not-start` | Completed state | 🆕 |
| R3-290 | `help-center.shortcuts.list-keyboard-shortcuts-with-platform-modifier` | Shortcuts tab | 🆕 |
| R3-291 | `help-center.contact.opens-contact-support-modal-pre-populated` | Contact CTA | 🆕 |

### Global Search

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-292 | `global-search.keyboard-shortcut-/-opens-search` | Shortcut | 🆕 |
| R3-293 | `global-search.types-plant-area-task-guide-categories` | Result categories | 🆕 |
| R3-294 | `global-search.tap-result-routes-to-detail` | Result tap | 🆕 |
| R3-295 | `global-search.no-results-shows-empty-state` | Empty | 🆕 |
| R3-296 | `global-search.recent-searches-shown-on-focus-empty-input` | Recent state | 🆕 |

### Global Quick Add

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-297 | `quick-add.menu.items-add-plant-task-blueprint-plan-note-list` | Inventory | 🆕 |
| R3-298 | `quick-add.menu.add-plant-routes-to-shed-add-plant-modal` | Route | 🆕 |
| R3-299 | `quick-add.menu.add-task-routes-to-add-task-modal` | Route | 🆕 |
| R3-300 | `quick-add.menu.add-blueprint-routes-to-schedule-with-modal-open` | Route + deep-link | 🆕 |

### Update Banner

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-301 | `update-banner.regression-22.0014.sw-aware-reload-activates-waiting-worker` | SW path | 🆕 |
| R3-302 | `update-banner.regression-22.0020.dispatched-on-poll-when-SW-finds-update` | Polling dispatch | 🆕 |
| R3-303 | `update-banner.countdown-3s-and-fires-reload` | Timer | 🆕 |
| R3-304 | `update-banner.dismiss-not-allowed-by-design` | Mandatory | 🆕 |

### Contact Support Modal

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-305 | `support.opens-with-current-version-prefilled` | Pre-fill | 🆕 |
| R3-306 | `support.send.creates-row-and-shows-thanks-card` | Submit | 🆕 |
| R3-307 | `support.attach-screenshot.button-uploads-photo` | Attachment | 🆕 |

### Cookie / Privacy Modals

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-308 | `cookies.modal.accept-all-stores-flag-and-closes` | Acceptance | 🆕 |
| R3-309 | `cookies.modal.reject-non-essential-stores-flag-and-suppresses-analytics` | Rejection | 🆕 |
| R3-310 | `cookies.modal.shown-once-per-major-policy-update` | Version-key | 🆕 |
| R3-311 | `privacy.modal.opens-from-footer-and-renders-policy` | Policy render | 🆕 |

---

## R3.30 — Quick Access sub-routes + Mobile-only

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-312 | `quick-access.deep-link.from-push.lands-on-/quick-with-action-context` | Deep link contract | 🆕 |
| R3-313 | `quick-access.profile-dropdown.same-items-as-desktop` | Parity | 🆕 |
| R3-314 | `quick-access.regression-22.0015-22.0016.hero-routes-to-dashboard-and-no-square-around-avatar` | Layout regression | 🆕 |
| R3-315 | `quick-access.regression-22.0015.removed-open-full-dashboard-pill-not-present` | Removal regression | 🆕 |
| R3-316 | `quick-calendar.deep-link.?date=YYYY-MM-DD-opens-correct-day` | Param contract | 🆕 |

---

## R3.31 — PWA + Offline + Capacitor

ref: [`99-cross-cutting/22-pwa.md`](../app-reference/99-cross-cutting/22-pwa.md), [`23-capacitor.md`](../app-reference/99-cross-cutting/23-capacitor.md), [`16-offline-queue.md`](../app-reference/99-cross-cutting/16-offline-queue.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-317 | `pwa.sw.skipWaiting-on-postMessage-activates` | Workbox contract | 🆕 |
| R3-318 | `pwa.sw.precache-includes-build-version-json` | Precache list | 🆕 |
| R3-319 | `pwa.runtime-cache.network-first-falls-back-to-cache` | NetworkFirst | 🆕 |
| R3-320 | `pwa.runtime-cache.cache-cleanup-on-version-bump` | Cleanup | 🆕 |
| R3-321 | `pwa.manifest.icons-and-name-correct` | Manifest contract | 🆕 |
| R3-322 | `pwa.install.iOS-Safari-shows-add-to-home-instructions` | iOS branch | 🆕 |
| R3-323 | `offline-queue.kind-task-complete.queues-and-flushes-on-reconnect` | Replay kind | 🆕 |
| R3-324 | `offline-queue.kind-blueprint-create.queues-and-flushes` | Replay kind | 🆕 |
| R3-325 | `offline-queue.kind-note-create.queues-and-flushes` | Replay kind | 🆕 |
| R3-326 | `offline-queue.replay-order.preserves-FIFO` | FIFO contract | 🆕 |
| R3-327 | `offline-queue.replay-failure.row-stays-queued-and-retries-on-next-online` | Retry semantics | 🆕 |
| R3-328 | `offline-queue.banner.shows-N-pending-actions` | UI counter | 🆕 |
| R3-329 | `offline-queue.banner.tap-shows-detail-list-with-cancel-per-row` | Detail action | 🆕 |
| R3-330 | `capacitor.push.permission-grant-registers-fcm-token-server-side` | Native push | 🆕 |
| R3-331 | `capacitor.push.tap-notification-deep-links-into-app` | Cold-start link | 🆕 |
| R3-332 | `capacitor.camera.permission-denial-shows-fallback-text-explainer` | Permission fallback | 🆕 |
| R3-333 | `capacitor.share.button-opens-native-share-sheet` | Native share | 🆕 |
| R3-334 | `capacitor.app-state-change.foreground-fires-version-check` | Foreground re-check | 🆕 |

---

## R3.32 — Caching, Realtime, AI rate-limit, Error handling

### Caching

ref: [`99-cross-cutting/14-caching.md`](../app-reference/99-cross-cutting/14-caching.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-335 | `cache.dashboard-v2.localStorage-key-and-purge-of-v1-on-mount` | Migration purge | 🆕 |
| R3-336 | `cache.seasonal-picks.localStorage-keyed-by-home-and-week` | Key contract | 🆕 |
| R3-337 | `cache.seasonal-picks.week-rollover-invalidates` | Stale check | 🆕 |
| R3-338 | `cache.image-proxy.supabase-cdn-returns-same-hash-on-second-load` | Proxy contract | 🆕 |
| R3-339 | `cache.quick-launcher-pins.local-first-and-remote-revalidate` | Local-first wave | 🆕 |
| R3-340 | `cache.shed.useCachedShed-revalidates-from-network` | SWR-style | 🆕 |

### Realtime (per channel)

ref: [`99-cross-cutting/15-realtime.md`](../app-reference/99-cross-cutting/15-realtime.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-341 | `realtime.tasks.insert-update-delete-fires-and-reflects-in-list` | Tasks channel | 🆕 |
| R3-342 | `realtime.blueprints.update-fires-and-reflects-in-schedule` | Blueprints channel | 🆕 |
| R3-343 | `realtime.plants.insert-fires-and-shed-list-updates` | Plants channel | 🆕 |
| R3-344 | `realtime.notifications.insert-fires-and-bell-badge-increments` | Notifications channel | 🆕 |
| R3-345 | `realtime.presence.member-joins-shows-presence-dot` | Presence channel | 🆕 |
| R3-346 | `realtime.disconnect.reconnect-resubscribes-without-data-gap` | Resubscription | 🆕 |
| R3-347 | `realtime.cross-home.member-in-other-home-event-does-not-fire-on-this-home-channel` | RLS in realtime | 🆕 |

### AI rate-limit

ref: [`99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-348 | `ai.gemini.cascade-pro-falls-back-to-flash-on-failure` | Model fallback | 🆕 |
| R3-349 | `ai.gemini.over-system-rate-limit-returns-429-and-shows-friendly-banner` | Rate limit | 🆕 |
| R3-350 | `ai.gemini.over-user-quota-returns-429-and-shows-upgrade-banner` | User quota | 🆕 |
| R3-351 | `ai.gemini.empty-response-shows-not-quite-sure-fallback-message` | Empty content | 🆕 |
| R3-352 | `ai.gemini.gemini-key-missing-server-side-returns-500-and-toast` | Config error | 🆕 |

### Error handling / Sentry

ref: [`99-cross-cutting/20-error-handling.md`](../app-reference/99-cross-cutting/20-error-handling.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-353 | `error.page.captured-exception-shows-fallback-with-reload-button` | Top-level boundary | 🆕 |
| R3-354 | `error.page.includes-sentry-event-id-for-support-quote` | Event-id render | 🆕 |
| R3-355 | `error.network.PostgREST-500-shows-toast-and-keeps-form-state` | Recoverable error | 🆕 |
| R3-356 | `error.report-error.function-called-on-uncaught-runtime-error` | Edge fn called | 🆕 |

---

## R3.33 — Tier gating sweep

ref: [`99-cross-cutting/17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-357 | `tier.sprout.AI-chat-quota-5-per-day-cap` | Hard cap | 🆕 |
| R3-358 | `tier.botanist.AI-chat-quota-25-per-day-cap` | Cap | 🆕 |
| R3-359 | `tier.sage.AI-chat-quota-100-per-day-cap` | Cap | 🆕 |
| R3-360 | `tier.sage.AI-image-imagen-3-per-hour-cap` | Imagen cap | 🆕 |
| R3-361 | `tier.evergreen.no-effective-cap-treats-as-unlimited` | Unlimited tier | 🆕 |
| R3-362 | `tier.lock.upgrade-cta-from-lock-state-routes-to-Account-Tier` | CTA path | 🆕 |

---

## R3.34 — RLS isolation sweep (every table)

ref: [`99-cross-cutting/19-rls-patterns.md`](../app-reference/99-cross-cutting/19-rls-patterns.md)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-363 | `rls.tasks.user-cannot-read-other-home-tasks` | Tasks isolation | 🆕 |
| R3-364 | `rls.plants.user-cannot-read-other-home-plants` | Plants isolation | 🆕 |
| R3-365 | `rls.inventory_items.user-cannot-read-others` | Instances isolation | 🆕 |
| R3-366 | `rls.notes.user-cannot-read-other-home-notes` | Notes isolation | 🆕 |
| R3-367 | `rls.notifications.user-cannot-read-others` | Notif isolation | 🆕 |
| R3-368 | `rls.chat_messages.user-cannot-read-others` | Chat isolation | 🆕 |
| R3-369 | `rls.weekly_overviews.user-cannot-read-other-homes` | Weekly isolation | 🆕 |
| R3-370 | `rls.home_seasonal_picks.user-cannot-read-other-homes` | Picks isolation | 🆕 |
| R3-371 | `rls.plans.user-cannot-read-other-home-plans` | Plans isolation | 🆕 |
| R3-372 | `rls.guides.author-anonymous-on-author-delete-still-readable` | Anonymise on delete | 🆕 |
| R3-373 | `rls.automation_runs.member-without-integrations-view-cannot-list` | Permission gate | 🆕 |

---

## R3.35 — Accessibility sweep (every modal)

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-374 | `a11y.task-modal.focus-trap-and-esc-close` | Modal contract | 🆕 |
| R3-375 | `a11y.add-task-modal.same-contract` | Modal contract | 🆕 |
| R3-376 | `a11y.bulk-search-modal.same-contract` | Modal contract | 🆕 |
| R3-377 | `a11y.plant-edit-modal.same-contract` | Modal contract | 🆕 |
| R3-378 | `a11y.instance-edit-modal.tab-keys-cycle-tabs` | Tablist nav | 🆕 |
| R3-379 | `a11y.confirm-modal.default-focus-on-cancel` | Safer default | 🆕 |
| R3-380 | `a11y.delete-account-modal.input-receives-focus-on-open` | Focus convention | 🆕 |
| R3-381 | `a11y.shepherd-flows.steps-respect-reduced-motion` | Walkthroughs | 🆕 |
| R3-382 | `a11y.skip-link.first-tab-jumps-to-main` | Skip link | 🆕 |
| R3-383 | `a11y.colour-contrast.high-contrast-mode-meets-AA-on-buttons` | Contrast | 🆕 |
| R3-384 | `a11y.live-region.toast-uses-aria-live-polite` | Live regions | 🆕 |
| R3-385 | `a11y.live-region.update-banner-uses-aria-live-assertive` | Live regions | 🆕 |
| R3-386 | `a11y.keyboard-only.full-add-plant-flow-completes-without-mouse` | Keyboard flow | 🆕 |

---

## R3.36 — Performance budget + smoke

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-387 | `perf.cold-start.dashboard.TTI-under-4s-3g-fast` | TTI budget | 🆕 |
| R3-388 | `perf.cold-start.shed.TTI-under-4s-3g-fast` | TTI budget | 🆕 |
| R3-389 | `perf.bundle.index-js-gzipped-under-400kb-budget` | Bundle size | 🆕 |
| R3-390 | `perf.bundle.calendar-chunk-under-150kb` | Per-chunk | 🆕 |
| R3-391 | `perf.image.proxy-hit-under-200ms-after-warm-cache` | CDN warm | 🆕 |
| R3-392 | `perf.scroll.shed-1000-rows-no-jank-over-50ms-frame` | Scroll smoothness | 🆕 |
| R3-393 | `perf.realtime.tasks-update-paints-under-200ms` | Realtime paint | 🆕 |

---

## R3.37 — Maintenance / Release Notes / What's New

| # | Test | Description | Status |
|---|------|-------------|--------|
| R3-394 | `maintenance.app_config.maintenance_mode-on-shows-screen-and-blocks-app` | Maintenance gate | 🆕 |
| R3-395 | `maintenance.message-rendered-from-app_config.value.message` | Custom message | 🆕 |
| R3-396 | `maintenance.off-after-on-restores-app-without-reload` | Realtime sub | 🆕 |
| R3-397 | `release-notes.modal.opens-on-version-bump-after-reload` | Auto-open | 🆕 |
| R3-398 | `release-notes.modal.history-tab-shows-prior-versions` | History tab | 🆕 |
| R3-399 | `release-notes.modal.filters-out-versions-newer-than-bundle` | Bundle-version filter | 🆕 |
| R3-400 | `release-notes.modal.section-with-no-items-not-rendered` | Empty section | 🆕 |
| R3-401 | `release-notes.indicator.dot-on-profile-avatar-when-unseen-version-recent` | Whats-new dot | 🆕 |

---

# Final totals after Round 3

- Round 1: ~470 tests (~110 existing, ~360 new)
- Round 2: +140 (the deep-dives the user called for first)
- Round 3: +250 (every remaining area)
- **Grand total: ~860 tests, ≈750 net-new**

## Coverage map — every area touched at least once

| Area | Round it was deep-dived in |
|---|---|
| 01 Onboarding & Auth | R1 · R2 · R3 |
| 02 Dashboard | R1 · R2 · R3 |
| 03 Garden Hub | R1 · R3 |
| 04 Planner & Shopping | R1 · R2 · R3 |
| 05 Tools | R1 · R2 · R3 |
| 06 Account & Settings | R1 · R2 · R3 |
| 07 Management & Admin | R1 · R2 · R3 |
| 08 Modals & Overlays | R1 · R2 · R3 |
| 09 Persistent UI | R1 · R3 |
| 99 Cross-cutting (RLS, security, a11y, perf, PWA, offline, AI, realtime, caching) | R1 · R3 |

Every screen in the master `00-INDEX.md` has at least one named test now, and the surfaces with the most user-visible complexity (Task Modal harvest footer, Plant Doctor chat, Members, Plan Staging, Garden Overhaul, Realtime channels, RLS, PWA) have ≥10 tests each.

## Seed file deltas needed (for the new tests)

| Seed file | New rows |
|---|---|
| `00_bootstrap.sql` | + admin role on worker 0 (for admin-only tests like Reset Account Data) |
| `02_plants_shed.sql` | + 2 plants for bulk-multi-select tests |
| `03_tasks_blueprints.sql` | + 1 paused blueprint, + 1 seasonal-restrict blueprint, + 1 tombstoned date |
| `04_weather.sql` | + 1 frost alert, + 1 heatwave alert (multi-stack) |
| `05_planner.sql` | + 1 overhaul-kind plan with 3 concepts seeded |
| `06_ailments_watchlist.sql` | + 1 ailment with 5 steps for editor reorder tests |
| `07_guides.sql` | + 1 draft guide for draft-isolation tests |
| `12_shopping_lists.sql` | + 1 archived list |
| `13_weekly_overview.sql` (NEW) | weekly_overviews row, pollen_snapshots row |
| `14_notes.sql` (NEW) | 4 notes (pinned, regular, archived, multi-link) |
| `15_nursery.sql` (NEW) | 5 packets across statuses, 3 sowings (sown, germinated, ready-to-plant-out) |
| `16_walk.sql` (NEW) | 1 walk session with mixed outcomes |
| `17_audit_log.sql` (NEW) | 50 ai_usage_log rows spanning 30 days for filter tests |
| `18_members.sql` (NEW) | second test member with viewer role |
| `19_automations.sql` (NEW) | 1 active automation with rain-skip + heat-trigger, 30 automation_runs history rows |
| `20_devices.sql` (NEW) | Shelly + Tasmota device rows in mixed online state |
| `21_realtime_test_seeds.sql` (NEW) | dedicated rows for realtime tests that don't survive other tests |

That's 9 brand-new seed files + 8 extensions to existing ones.

## Estimated cumulative effort (final)

- 860 total tests; ≈110 already passing; **≈750 net-new**.
- 15 min average per net-new test → ≈188 hours.
- 21 themed PRs of ≈35 tests each.
- Single contributor at 2 PRs/week → 10–11 weeks to full coverage.
- With Playwright MCP in the loop (auto-author + fixture replay) → realistically 6–7 weeks.

## Next move

Pick a starting PR. My recommended order:

1. **PR 1 — Auth + Onboarding + Home Setup (incl. Join Home)** — covers the user's flagged gap and sets the foundation for everything else (~50 tests)
2. **PR 2 — Shed + Plants core CRUD** — high-traffic, well-defined (~40 tests)
3. **PR 3 — Tasks + Calendar + Harvest window** — high regression surface (~50 tests)
4. **PR 4 — Plant Doctor + Chat** — recent bug-fix regressions, big payoff (~45 tests)
5. **PR 5 — Members + Multi-home + RLS sweep** — security-critical (~40 tests)
6. **PR 6 — Planner + Shopping + Blueprints** — core domain (~50 tests)
7. **PR 7 — Weekly Overview + Seasonal Picks + Garden Overhaul** — recent features (~35 tests)
8. **PR 8 — PWA + Offline + Update banner** — infrastructure (~30 tests)
9. **PR 9 — Accessibility sweep** — all modals + global a11y (~20 tests)
10. **PR 10 — Performance smoke + Audit + Devices/Automations** — infra (~30 tests)
11. **PR 11–21** — Layout editor, Visualiser/Sprite, Nursery, Notes, Senescence, Sun Tracker, Light Sensor, Companions, Guides, Plan Staging, Walk, Realtime channels, Caching

Say which PR you want first and we'll cut the catalog, write the seed glue, and start authoring.
