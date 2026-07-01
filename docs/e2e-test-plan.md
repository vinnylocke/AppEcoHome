# Rhozly — E2E test plan

**Status:** ✅ ~554 passing tests across **31 spec files** · 🔲 ~22 planned · 🚧 17 in progress · last verified 2026-06-15.
Full status detail: **[`e2e-test-plan/00-status.md`](e2e-test-plan/00-status.md)**.

This file is the **index**. Each section's test rows + seed dependencies + page-object links live in their own file at `docs/e2e-test-plan/`. The fixtures (UUIDs + per-worker plant IDs) live in [`e2e-test-plan/01-seeded-fixtures.md`](e2e-test-plan/01-seeded-fixtures.md) — single source of truth, cross-linked from CLAUDE.md and every section.

## Quick links

- [Seeded fixtures (UUIDs + plant IDs)](e2e-test-plan/01-seeded-fixtures.md) — canonical reference
- [Status snapshot](e2e-test-plan/00-status.md) — current passing / planned / in-progress counts
- [TESTING.md](../TESTING.md) — framework setup + how to run
- [Archive](e2e-test-plan/99-archive.md) — old → new section mapping, dropped appendices

## Sections

| # | Surface | Spec(s) | File |
|---|---|---|---|
| 2 | Authentication | `auth.spec.ts` | [02-auth.md](e2e-test-plan/02-auth.md) |
| 3 | Home Setup Wizard | `home-setup-{create,join}.spec.ts` | [03-home-setup.md](e2e-test-plan/03-home-setup.md) |
| 4 | Welcome Modal | `welcome-modal.spec.ts` | [04-welcome-modal.md](e2e-test-plan/04-welcome-modal.md) |
| 5 | Dashboard (weather, locations, calendar, harvest window) | `dashboard.spec.ts` + `weather.spec.ts` + `calendar-window.spec.ts` | [05-dashboard.md](e2e-test-plan/05-dashboard.md) |
| 6 | The Shed (CRUD, discovery, edit, instances) | `shed-{crud,discovery}.spec.ts` + `plant-edit-assignment.spec.ts` + `instance-edit-tabs.spec.ts` | [06-shed.md](e2e-test-plan/06-shed.md) |
| 7 | Task Schedule (Routines + Optimise) | `schedule{,-validation,-optimise}.spec.ts` | [07-schedule.md](e2e-test-plan/07-schedule.md) |
| 8 | Task Lifecycle + Harvest Window | `tasks.spec.ts` + `harvest-window.spec.ts` | [08-task-lifecycle.md](e2e-test-plan/08-task-lifecycle.md) |
| 9 | Plant Doctor + Garden AI Chat | `plant-doctor{,-chat}.spec.ts` | [09-plant-doctor.md](e2e-test-plan/09-plant-doctor.md) |
| 10 | Planner | `planner{,-restore}.spec.ts` | [10-planner.md](e2e-test-plan/10-planner.md) |
| 11 | Ailment Watchlist | `watchlist.spec.ts` | [11-watchlist.md](e2e-test-plan/11-watchlist.md) |
| 12 | Profile (Garden + Gardener's) | `garden-profile.spec.ts` (+ `gardener-profile.spec.ts` planned) | [12-profile.md](e2e-test-plan/12-profile.md) |
| 13 | Location Management + Members + RLS | `area-setup.spec.ts` + `members-permissions.spec.ts` + `rls-isolation-db.spec.ts` | [13-management.md](e2e-test-plan/13-management.md) |
| 14 | Guides (Rhozly + Community) | `guides.spec.ts` + `community-guides.spec.ts` | [14-guides.md](e2e-test-plan/14-guides.md) |
| 15 | Plant Visualiser | `visualiser.spec.ts` | [15-visualiser.md](e2e-test-plan/15-visualiser.md) |
| 16 | Light — Sensor + Tab + Stats + Lux History | `lightsensor.spec.ts` + `lighttab.spec.ts` + `statstab.spec.ts` | [16-light.md](e2e-test-plan/16-light.md) |
| 17 | Global Layout + Navigation | `layout.spec.ts` | [17-layout-nav.md](e2e-test-plan/17-layout-nav.md) |
| 18 | Realtime | `realtime.spec.ts` | [18-realtime.md](e2e-test-plan/18-realtime.md) |
| 19 | Yield Recorder + Predictor | `yield.spec.ts` | [19-yield.md](e2e-test-plan/19-yield.md) |
| 20 | Shopping Lists | `shopping{,-edge-cases}.spec.ts` | [20-shopping.md](e2e-test-plan/20-shopping.md) |
| 21 | Companion Plants | `companion-plants.spec.ts` | [21-companion-plants.md](e2e-test-plan/21-companion-plants.md) |
| 22 | Garden Layout Builder | `garden-layout.spec.ts` | [22-garden-layout-builder.md](e2e-test-plan/22-garden-layout-builder.md) |
| 23 | AI Plant Overhaul (freshness + override) | `ai-plant-{freshness,override}.spec.ts` | [23-ai-plant-overhaul.md](e2e-test-plan/23-ai-plant-overhaul.md) |
| 24 | The Nursery | `nursery-lifecycle.spec.ts` | [24-nursery.md](e2e-test-plan/24-nursery.md) |
| 25 | Security (auth + XSS + storage) | `security-{auth,xss,storage}.spec.ts` | [25-security.md](e2e-test-plan/25-security.md) |
| 26 | Cross-home Data Isolation | `data-isolation.spec.ts` (isolation project) | [26-data-isolation.md](e2e-test-plan/26-data-isolation.md) |
| 27 | Help Center — Documentation drawer | `help-center-docs.spec.ts` | [27-help-center-docs.md](e2e-test-plan/27-help-center-docs.md) |
| 28 | Head Gardener (AI manager) | `head-gardener.spec.ts` | [28-head-gardener.md](e2e-test-plan/28-head-gardener.md) |
| 29 | Garden Walk | `garden-walk.spec.ts` | [29-garden-walk.md](e2e-test-plan/29-garden-walk.md) |

## Workflow

This is a **living plan**. Update it whenever:

- A new feature or route is added → add a new section file under `docs/e2e-test-plan/`
- A test is implemented → flip its row to `✅ Passing` in its section file
- A test breaks → flip to `❌ Failing` and note the cause inline
- A selector, heading, or button label changes → update any affected rows + the Page Object reference

**Test types:** ✅ Positive (happy path) · ❌ Negative (error, invalid input, edge case)

**Status legend:** `🔲 Planned` · `🚧 In Progress` · `✅ Passing` · `❌ Failing` · `⏭ Skipped` (intentional) · `❌ N/A` (feature does not exist)

Keep the [00-status.md](e2e-test-plan/00-status.md) banner counts in sync when section status changes — easiest path is to commit doc updates with the spec change that caused them.
