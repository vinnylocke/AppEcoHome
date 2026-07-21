# 34. Today's Tasks Tray

**Spec file:** `tests/e2e/specs/today-tasks-tray.spec.ts`
**Page Object:** — (drives raw `data-testid`s directly via `authenticatedPage`)
**Seed dependencies:** `00_bootstrap.sql` (user, home), `03_tasks_blueprints.sql` (today's + overdue tasks so the tray lists rows)
**App-reference:** [09-persistent-ui/12-today-tasks-tray.md](../app-reference/09-persistent-ui/12-today-tasks-tray.md) · [09-persistent-ui/01-header.md](../app-reference/09-persistent-ui/01-header.md) · [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md)

**Global "Today's Tasks" tray (dashboard-nav-tasks-tray redesign Stage 2, 2026-07-21).** A right-anchored drawer reachable from a header trigger (`today-tasks-tray-trigger`, ListChecks + overdue badge) on every non-focus screen, so today's + overdue tasks are one tap away anywhere in the app. Built on `ModalShell`'s new `drawer` variant; the body is the shared compact `TaskList` (per-row inline complete / postpone / delete); a quick-add opens the slim `QuickAddTaskModal`; a footer button jumps to the full calendar board.

## Tray open / act / close (`today-tasks-tray.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| TRAY-001 | ✅ | The header trigger opens the tray from a non-home screen (`/shed`); the "Today's tasks" heading shows; the close button dismisses it (`toHaveCount(0)`) | — | 🔲 Pending (first run) |
| TRAY-002 | ✅ | The tray lists task rows, each exposing inline **complete** (`Mark task … as complete`) and **postpone** (`Postpone task …`) — act without leaving the screen | — | 🔲 Pending (first run) |
| TRAY-003 | ✅ | The tray's quick-add (`today-tray-quick-add`) opens the slim `quick-add-task-modal` | — | 🔲 Pending (first run) |
| TRAY-004 | ✅ | The tray's "Open the full board" (`today-tray-open-board`) navigates to `?view=calendar` | — | 🔲 Pending (first run) |
| TRAY-010 | ✅ | Focus mode (`/walk`) hides the header, so `today-tasks-tray-trigger` has count 0 | — | 🔲 Pending (first run) |

**Notes**
- The tray shares the `TaskEngine` 60s cache with the home/calendar, so opening it on a warmed screen paints instantly (`peekCache`).
- Related unit coverage: `tests/unit/lib/taskDueLabel.test.ts` (the B2 relative due-date label the tray rows show); `tests/unit/components/NextBestAction.test.ts` (the B6 first-task rung the Porch now wires from `peekCache`).
