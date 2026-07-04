# 8. Task Lifecycle + Harvest Window

**Spec files:** `tests/e2e/specs/tasks.spec.ts` · `tests/e2e/specs/harvest-window.spec.ts`
**Page Objects:** `tests/e2e/pages/TaskListPage.ts` · `tests/e2e/pages/TaskModalPage.ts`
**Seed dependencies:** `03_tasks_blueprints.sql` (includes the three Wave-20 harvest tasks)
**Per-test reset for harvest contract:** `tests/e2e/utils/harvestSeedReset.ts`
**App-reference:** [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md), [04-planner/](../app-reference/04-planner/)

## Task display

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| TASK-001 | ✅ | Pending task appears in Pending tab | — | ✅ Passing |
| TASK-002..009 | ✅ | Type badges — Watering, Pruning, Harvesting, Fertilizing, Inspection, Pest Control, Maintenance, Planting | — | ✅ Passing |
| TASK-010 | ✅ | Overdue task (-7d, Pending) visible | — | ✅ Passing |
| TASK-011 | ✅ | Overdue task has red/warning indicator | — | ✅ Passing |
| TASK-012 | ✅ | Future task (+3d) visible | — | ✅ Passing |
| TASK-013 | ✅ | Ghost task appears for recurring blueprint (anchored to Daily Garden Check, freq=1, for timezone resilience) | — | ✅ Passing |
| TASK-014 | ✅ | Skipped task absent from Pending tab | — | ✅ Passing |
| TASK-015 | ✅ | Completed task in Completed tab (conditional: seeded due_date is UTC; may not appear in UTC+N near midnight — TASK-016 covers tab presence) | — | ✅ Passing |

## Task actions

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| TASK-016 | ✅ | Mark complete moves task to Completed tab | — | ✅ Passing |
| TASK-017 | ✅ | Mark complete on ghost → physical task created | — | ✅ Passing |
| TASK-018 | ✅ | Postpone (Skip) → Skipped, disappears from Pending | — | ✅ Passing |
| TASK-019 | ✅ | Skipped tombstone suppresses ghost regeneration | — | ✅ Passing |
| TASK-020 | ✅ | Auto-watering skip on rain-forecast day | — | ✅ Passing |
| TASK-021 | ✅ | Delete task confirm | — | ✅ Passing |
| TASK-022 | ✅ | Delete task cancel | — | ✅ Passing |
| TASK-023 | ✅ | Task linked to INV_BASIL shows plant reference | — | ✅ Passing |
| TASK-024 | ✅ | Task with location shows location badge | — | ✅ Passing |
| TASK-025 | ✅ | Postpone ghost with "shift all future" → blueprint start_date updates, tombstone created, future ghosts shift | — | ✅ Passing |

## Harvest Window contract (Wave 20+)

**Spec file:** `tests/e2e/specs/harvest-window.spec.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| HRV-001 | ✅ | In-window task — 4-button footer + green pill | — | ✅ Passing |
| HRV-002 | ✅ | "Harvested" opens the yield sheet; Skip completes → footer transitions away (single instance → no toggle) | — | ✅ Passing |
| HRV-003 | ✅ | "Not yet" opens 3 / 5 / 7-day popover | — | ✅ Passing |
| HRV-004 | ✅ | "Not yet 3 days" snooze flow completes (modal closes) | — | ✅ Passing |
| HRV-005 | ✅ | Pre-snoozed Strawberry NOT in today's calendar agenda (Wave 22.0024) — daily list still shows snoozed tasks, calendar agenda hides them via effective_due_date | — | ✅ Passing |
| HRV-006 | ✅ | "Picked some" enabled when task has linked instance | — | ✅ Passing |
| HRV-007 | ✅ | Window-closed footer + amber pill on Pumpkin (window_end -2d) | — | ✅ Passing |
| HRV-008 | ✅ | "Mark missed" removes task from Pending (status='Skipped') | — | ✅ Passing |
| HRV-009 | ✅ | "Not yet 7 days" smoke — modal closes; cap-to-window asserted elsewhere at DB level | — | ✅ Passing |
| HRV-010 | ✅ | "Harvested" → enter a yield → complete records it + closes the harvest footer | — | ✅ Passing |
| HRV-011 | ✅ | Multi-instance harvest (Harvest Mixed Bed, 2 instances) shows split/per-plant toggle; per-plant reveals one input per plant | TASK_HARVEST_MIXED | ✅ Passing |
