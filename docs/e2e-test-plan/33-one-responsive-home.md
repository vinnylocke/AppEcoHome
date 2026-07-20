# 33. One Responsive Home (Quick Access retirement) + Planting Helper

**Spec files:** `tests/e2e/specs/quick-access.spec.ts` · `tests/e2e/specs/quick-calendar.spec.ts`
**Page Object:** — (both specs drive raw `data-testid`s directly via `authenticatedPage`)
**Seed dependencies:** `00_bootstrap.sql` (user, home, onboarding baseline so no tour fires over the redirects), `03_tasks_blueprints.sql` (today's tasks for the planting-helper task list), `04_weather.sql` (weather snapshot for the rain-vs-watering tile)
**App-reference:** [02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) (**RETIRED**) · [02-dashboard/10-localized-task-calendar.md](../app-reference/02-dashboard/10-localized-task-calendar.md) · [99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md)

**One responsive home (2026-07-20).** The phone-only `/quick` launcher home (`QuickAccessHome`) was retired: phone + desktop now BOTH land on the responsive `/dashboard` (Simple density on phone = the fast glanceable view). The customisable launcher was never unique to `/quick` — the dashboard's `QuickActionsRow` renders from the SAME catalogue + saved pins (`home-quick-actions`, `home-quick-tile-*`, `home-quick-actions-customise`). `quick-access.spec.ts` was rewritten to assert the redirects + the launcher-on-dashboard; the genuinely-unique `/quick/calendar` planting helper is kept as a focus-mode tool, reached from the dashboard's "Today" launcher tile. **`quick-journal.spec.ts` was DELETED** (it tested the already-retired `/quick/journal` route).

## Routing — redirects + launcher on the dashboard (`quick-access.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| QUICK-001 | ✅ | Phone (375×812) `/` redirects to the responsive `/dashboard` (was `/quick`) | — | 🔲 Pending (re-verify) |
| QUICK-002 | ✅ | Phone legacy `/quick` redirects to `/dashboard` | — | 🔲 Pending (re-verify) |
| QUICK-003 | ✅ | The customisable launcher lives on the dashboard: `home-quick-actions` visible, default pins render as `home-quick-tile-doctor` / `home-quick-tile-shed`, and `home-quick-actions-customise` is present | — | 🔲 Pending (re-verify) |
| QUICK-004 | ✅ | The dashboard "Today" tile (`home-quick-tile-today`) opens the planting helper at `/quick/calendar` | — | 🔲 Pending (re-verify) |
| QUICK-016 | ✅ | `/quick/calendar` stays a focus-mode tool — no header (`banner` count 0), floating `quick-access-menu-button` visible | — | 🔲 Pending (re-verify) |
| QUICK-009 | ✅ | Desktop (1280×800) `/` redirects to `/dashboard` | — | 🔲 Pending (re-verify) |
| QUICK-010 | ✅ | Desktop `/quick` also redirects to `/dashboard` | — | 🔲 Pending (re-verify) |

## Planting helper — Localized Task Calendar (`quick-calendar.spec.ts`)

Mobile viewport (375×812). Mocks the `plant-doctor` edge fn (frost dates / planting guidance) so the calendar screen renders fully.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| QUICK-CAL-001 | ✅ | The **dashboard** Today tile (`home-quick-tile-today`) navigates to `/quick/calendar` and `localized-task-calendar` renders (repointed 2026-07-20 — the launcher lives on the dashboard now, not on the retired `/quick` home) | `plant-doctor`→frost dates | 🔲 Pending (re-verify) |
| QUICK-CAL-002 | ✅ | `/quick/calendar` renders all three sub-cards (`planting-calendar-card`, `rain-water-advice`, `quick-calendar-tasks`) | `plant-doctor`→frost dates | 🔲 Pending (re-verify) |
| QUICK-CAL-003 | ✅ | Planting card renders the frost dates after lookup (`planting-calendar-last-frost` / `-first-frost`) | `plant-doctor`→frost dates | 🔲 Pending (re-verify) |
| QUICK-CAL-004 | ✅ | Submitting a plant name renders the guidance result (`planting-calendar-result` / `-verdict`) | `plant-doctor`→frost dates then planting guidance (queued) | 🔲 Pending (re-verify) |
| QUICK-CAL-005 | ✅ | Back button (`quick-calendar-back`) returns to `/dashboard` (was `/quick` before the retirement) | `plant-doctor`→frost dates | 🔲 Pending (re-verify) |
| QUICK-CAL-006 | ✅ | Add button opens `QuickAddTaskModal`; saving inserts a task that appears in Today's tasks | `plant-doctor`→frost dates | 🔲 Pending (re-verify) |

## Removed coverage

- **`tests/e2e/specs/quick-journal.spec.ts` — DELETED.** It exercised `/quick/journal` (`QuickCapture`), a route retired before this change; the Capture tile deep-links to `/journal?open=add-entry` and the Journal hub's own coverage lives in [32-journal-notes-hub.md](./32-journal-notes-hub.md).
- **`tests/unit/components/QuickAccessHome.test.ts` — DELETED** alongside the `QuickAccessHome.tsx` component. `QuickTile.test.ts` is kept (QuickTile still powers the dashboard launcher).

## Related sections

- [30-home-main.md](./30-home-main.md) — the responsive dashboard both platforms now land on; HOME-005 asserts the default launcher tiles (`home-quick-tile-*`)
- [29-garden-walk.md](./29-garden-walk.md) — the other focus-mode surface; WALK-001/002 already assert the walk returns to `/dashboard`, not `/quick`
- [05-dashboard.md](./05-dashboard.md) — the classic dashboard content behind the Detailed density
