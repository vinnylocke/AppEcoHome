# PR 3 — E2E suite: Harvest Window contract + Calendar visualisations

## Why this scope (and not the full catalogue PR 3)

The catalogue's PR 3 line item is "Tasks + Calendar + Harvest window (~50 tests)" — too broad to ship in one focused session. Instead I'm proposing a regression-focused subset.

Recent commit history is concentrated on the harvest window contract:

```
4d0fbf1 fix(22.0023): chat reply duplication + Shed/task offers tightened
cd4815c fix(22.0022): keep amber harvest highlight on today's calendar cell
b336194 fix(22.0021): calendar overdueTasks query honours Wave 20
321ee5a fix(22.0020): home badge + calendar honour snooze; update banner fires reliably
3026680 fix(22.0019): overdue counter + Today Focus card route — both honour Wave 20
1c08c49 fix(22.0027): snoozed task uses next_check_at as effective due date
0e4b9f9 fix(22.0026): remove engine-level snooze filter so calendar sees snoozed tasks
00fd208 fix(22.0025): keep snoozed harvest task visible on calendar + agenda
b73b669 fix(22.0024): snooze reappears + rain-skip task update + library cron swap
```

That's nine consecutive fixes around the same invariant. The bug surface is well-mapped but the regression net is thin — no E2E tests guard most of it. This PR lays the net.

## App-reference files consulted

- [`08-modals-and-overlays/02-task-modal.md`](../app-reference/08-modals-and-overlays/02-task-modal.md) — full Harvest Window footer contract (4-button grid, Picked some sheet, Not yet popover, AI ripeness, window-closed footer, ghost materialisation).
- [`02-dashboard/03-calendar-tab.md`](../app-reference/02-dashboard/03-calendar-tab.md) — calendar dot positioning rules, agenda filtering, snoozed-task display.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) (briefly) — `next_check_at`, `window_end_date`, ghost ID format `ghost-{bp}-{date}`.

## Scope — 14 tests across 2 new spec files

### `harvest-window.spec.ts` (NEW — 9 tests)

| ID | Test | What it asserts |
|---|---|---|
| HRV-001 | In-window Harvesting task renders the 4-button footer | Opening a task with `window_end_date >= today` shows Harvested / Picked some / Not yet / Check with AI buttons + "Harvest window · N days left" green pill |
| HRV-002 | "Harvested" marks the task Completed | Click → task disappears from Pending tab, appears in Completed |
| HRV-003 | "Not yet" opens the 3 / 5 / 7-day snooze popover | Three options visible; aria-labels include "3 days", "5 days", "7 days" |
| HRV-004 | "Not yet 3 days" sets `next_check_at` and hides the task from today (22.0027 regression) | After snooze 3d, the task is not visible in Pending; status stays "Pending" not "Skipped"; row's `next_check_at` = today + 3 |
| HRV-005 | Snoozed harvest task reappears in Pending on its `next_check_at` (22.0024 regression) | After mocking `next_check_at = yesterday`, the task is back in Pending |
| HRV-006 | "Picked some" is disabled when `inventory_item_ids` is empty | Open a Harvesting task with no linked instances → button has `aria-disabled` or is disabled |
| HRV-007 | Window-closed Harvesting task renders the closed footer | Task with `window_end_date < today` shows "Log yield anyway" + "Mark missed" buttons + amber "Window closed" pill |
| HRV-008 | "Mark missed" flips status to "Skipped" | Click → task no longer in Pending; `tasks.status = 'Skipped'` in DB |
| HRV-009 | Snooze caps at `window_end_date` | If today + chosen snooze > `window_end_date`, `next_check_at` clamps to `window_end_date` |

### `calendar-window.spec.ts` (NEW — 5 tests)

| ID | Test | What it asserts |
|---|---|---|
| CAL-001 | Today's cell shows the amber harvest highlight when an in-window task is due (22.0022 regression) | The current-day cell on the calendar has a class/marker that lights amber for harvest-window-active tasks |
| CAL-002 | Overdue calendar dot honours Wave 20 `effective_due_date` (22.0021 regression) | A snoozed harvest task whose `next_check_at` is in the future does NOT render a red overdue dot on its original `due_date` |
| CAL-003 | Snoozed-task dot moves to `next_check_at`, not original `due_date` (22.0027) | Calendar cell at `next_check_at` has a dot; original `due_date` cell does not (for this task) |
| CAL-004 | Agenda — snoozed harvest task hidden on today's agenda when `next_check_at > today` | Tap today's cell → snoozed task is not in the agenda list |
| CAL-005 | Agenda — snoozed harvest task appears on the `next_check_at` day | Tap the `next_check_at` day → snoozed task is in the agenda list |

Total: **14 tests** across **2 new spec files**.

## Seed updates needed

`supabase/seeds/03_tasks_blueprints.sql`:

1. Extend the existing `'Harvest Tomatoes'` task to include `window_end_date = CURRENT_DATE + INTERVAL '7 days'` so it represents an "in-window" task by default. (Currently `window_end_date` is null, which would route through the old non-window path.)
2. Add a SECOND Harvest task: `'Pumpkin Final Harvest'` with `window_end_date = CURRENT_DATE - INTERVAL '2 days'` (window closed). Powers HRV-007 / HRV-008.
3. Add a THIRD Harvest task: `'Strawberry Snooze Test'` with `window_end_date = CURRENT_DATE + INTERVAL '4 days'`, `next_check_at = CURRENT_DATE + INTERVAL '2 days'`. Powers HRV-005, CAL-003, CAL-004, CAL-005 without each test having to perform the snooze itself.

All three follow the existing seed pattern (fixed UUID, `inventory_item_ids` linked to a seeded instance).

## Page objects

- `TaskModalPage.ts` — NEW. Locators for: window pill (in-window + closed variants), harvest footer buttons (Harvested, Picked some, Not yet, Check with AI), snooze popover (3/5/7 options), closed-footer buttons (Log yield anyway, Mark missed), the standard complete/postpone/delete row when not a harvest task.
- `CalendarPage.ts` — NEW. Locators for: today cell, day-cell-by-date, dot indicators, amber-harvest marker, agenda list, agenda task rows.
- `TaskListPage.ts` (existing) — extend with `harvestTaskByTitle(title)` so the spec can open the modal without coupling to the task's id.

## data-testid deltas required

Will scan during implementation. Expected:

- `task-modal-root`, `task-modal-harvest-footer`, `task-modal-harvest-window-pill`, `task-modal-harvest-window-closed-pill`
- `harvest-action-harvested`, `harvest-action-picked-some`, `harvest-action-not-yet`, `harvest-action-check-ai`
- `harvest-snooze-popover`, `harvest-snooze-3`, `harvest-snooze-5`, `harvest-snooze-7`
- `harvest-closed-log-yield`, `harvest-closed-mark-missed`
- `calendar-day-cell-{YYYY-MM-DD}`, `calendar-day-dot`, `calendar-day-amber-harvest`
- `calendar-agenda-list`, `calendar-agenda-task-{id}`

Source-level edits will be the absolute minimum needed — no refactors, just adding identifiers to the elements the tests have to find.

## Risks I've thought about

- **Date-relative seeds + cron timing.** All harvest seeds use `CURRENT_DATE` relative offsets, so they re-evaluate every day. Should be stable across runs.
- **Ghost task interference.** Some seeded tasks have parent blueprints that generate ghosts. I'll ensure my harvest test tasks are standalone (no `blueprint_id`) so the ghost engine doesn't manufacture duplicates.
- **Window pill timing.** If the "in window" check is `today <= window_end_date`, a seed with `window_end_date = CURRENT_DATE + INTERVAL '0 days'` is borderline. I'll keep all "in window" seeds at +4 or +7 days for clear separation.
- **Calendar dot rendering.** If the calendar uses canvas instead of DOM elements I'll need to fall back to an aria-label / role-based assertion. Per the app-reference doc, dots appear to be DOM. If they're SVG, the testid still works.
- **HRV-005 / HRV-009.** Both depend on the `effective_due_date` rule honouring `next_check_at`. If the implementation has drifted, these would catch a regression. If they fail unexpectedly, that's likely a real product bug, not a test bug.

## What this does NOT do

- Doesn't test the AI "Check with AI" sheet — that's gated on Sage+ tier and needs Gemini mocking. Deferred to PR 4 (Plant Doctor + Chat) where AI mocking will be shared infrastructure.
- Doesn't test the "Picked some" `HarvestPartialPickSheet` flow (quantity/unit/notes) — needs deeper modal coverage; deferred to a focused harvest-yield PR.
- Doesn't test drag-to-reschedule on the calendar — that's its own concern (touch + drag emulation in Playwright) and can ship later.
- Doesn't test ICS export, week view, or deep-link `?view=calendar&date=YYYY-MM-DD` — separate calendar PR.
- Doesn't add new tier-gating coverage — PR 9's job.

## Test plan + doc updates

- `docs/e2e-test-plan.md` — append HRV-001…009 and CAL-001…005 rows under Section 04 (Calendar) / Section 07 (Task lifecycle).
- `TESTING.md` — inventory bumped: `harvest-window.spec.ts` (9) + `calendar-window.spec.ts` (5).
- The app-reference files for Task Modal + Calendar Tab are already accurate — no updates needed.

## Acceptance criteria

- 14 / 14 new tests green under `--workers=1` against local DB (or documented skips).
- `tsc --noEmit` clean.
- Existing `tasks.spec.ts` regression — still green.
- No mutation of unrelated source files; data-testid additions only where targeted by tests.

---

**Plan ready for approval.** Reply "go ahead" / "looks good" to approve, or call out which tests to drop, swap, or add.
