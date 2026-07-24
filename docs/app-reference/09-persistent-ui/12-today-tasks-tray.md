# Today's Tasks Tray

> A right-anchored slide-out drawer that shows today's + overdue tasks — and, since 2026-07-22, a **Completed** tab of what you've ticked off today — so you can act on them without leaving whatever you're doing. Reached from the desktop header trigger or the phone Deck's **Tasks** slot on every non-focus screen. New in the dashboard-nav-tasks-tray redesign Stage 2 (2026-07-21).

**Triggers:** the checklist icon (`today-tasks-tray-trigger`) in the persistent header (**desktop-only** since 2026-07-22) and the Deck's **Tasks** slot (`bottom-tab-tasks`) on phones — both carry the overdue-count badge and open the same app-level tray.
**Source file:** `src/components/TodayTasksTray.tsx` (mounted once at app level in `src/App.tsx`).

---

## Quick Summary

One app-level instance, opened from the header on any non-focus route. It's built on **`ModalShell`'s `drawer` variant** (right-anchored, full-height) so it inherits the portal, focus trap, shared Escape stack and backdrop for free. The body is the **same compact `TaskList`** the home renders — today + overdue, every row carrying inline complete / postpone / delete — plus a quick "add task" (the slim `QuickAddTaskModal`) and a footer button to the full calendar board. It pulls from the shared `TaskEngine` cache, so opening it on a screen that already warmed today's list paints instantly.

---

## Role 1 — Technical Reference

### Component graph

```
App (AppShell) — owns `trayOpen` state + the header trigger
└── TodayTasksTray (mounted next to MobileNavDrawer / CaptureSheet; renders null when homeId is null)
    └── ModalShell (drawer variant; z = Z.drawer)
        └── panel
            ├── sticky header (title "Today's tasks" + overdue badge + quick-add + close)
            ├── Today / Completed segmented tabs (2026-07-22 — `today-tray-tab-pending` / `today-tray-tab-completed`; drives TaskList's `compactView`)
            ├── TaskList (compact, compactView={view}, hideCalendarLink, targetDate = today) — key={refreshKey}
            └── sticky footer → "Open the full board" (→ /calendar — #12)
    └── QuickAddTaskModal (rendered only while open && quickAddOpen)
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `open` | `boolean` | AppShell `trayOpen` | Drives ModalShell `isOpen` |
| `onClose` | `() => void` | AppShell `setTrayOpen(false)` | Close from the X, backdrop, Escape, or board button |
| `homeId` | `string \| null` | `profile.home_id` | Scopes TaskList + QuickAddTaskModal; the component returns `null` when null |
| `overdueCount` | `number` | AppShell `overdueTaskCount` | Header overdue badge (and the trigger's badge in App) |

### State (local)

- `quickAddOpen` (`useState<boolean>`) — the slim add-task modal, gated on `open && quickAddOpen` so it can't outlive the tray.
- `refreshKey` (`useState<number>`) — bumped after a successful quick-add to remount the embedded TaskList (a direct insert doesn't flow through TaskList's own state); paired with `TaskEngine.invalidateCache(homeId)`.
- `view` (`useState<"pending" | "completed">`) — the Today / Completed tab (2026-07-22). Passed to TaskList as `compactView`: "completed" filters the SAME engine fetch to today's completed tasks (newest-completed data, inline toggle back to Pending stays live); an empty completed view renders its own quiet state (`task-list-empty-completed`).

### Data flow — read paths

- **`TaskList` (compact)** self-fetches via `TaskEngine.fetchTasksWithGhosts({ startDateStr = endDateStr = today, includeOverdue: true, todayStr = today })` — the SAME cache key the home's compact today list warms, so the two share the 60s engine cache (no double fetch). Because ModalShell unmounts its children when closed, each open re-mounts TaskList → a fresh fetch (with an instant `peekCache` paint when warm).
- The header **overdue badge** comes from App's already-computed `overdueTaskCount` (no extra query).

### Data flow — write paths

- **Inline row actions** (complete / postpone / delete) are TaskList's own writes to `tasks` — documented on [Task List / Add Task](../08-modals-and-overlays/01-add-task-modal.md) and the [Tasks data model](../99-cross-cutting/04-data-model-tasks.md).
- **Quick add** → `QuickAddTaskModal` inserts a one-off `tasks` row (`scope: "home"`, `status: "Pending"`); on success the tray invalidates the engine cache + remounts TaskList so the new task appears immediately.

### Edge functions invoked

None directly (TaskList + QuickAddTaskModal own their data paths).

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` (daily) | Populates the tasks the tray lists |
| `run-automations` (5 min) | May auto-complete tasks the tray shows |

### Realtime channels

None of its own. Task inserts/updates flow through App's existing `tasks` realtime wiring (which refreshes `overdueTaskCount`); the tray's TaskList re-fetches on its next open.

### Tier gating / Beta gating

None — identical for every tier. (The Plant Doctor and AI features reached elsewhere are gated at their own surfaces, not here.)

### Permissions

- The tray itself is not permission-gated (any home member can see today's tasks).
- Inline row actions + quick-add enforce the `tasks.*` keys inside TaskList / QuickAddTaskModal (delete-own vs delete-any, create), unchanged by this surface.

### Error states

| State | What happens |
|-------|--------------|
| No `homeId` | The component returns `null` (no tray, no trigger — the trigger is also `profile?.home_id`-gated) |
| TaskList fetch fails | TaskList shows its own empty/loading state; the tray chrome still renders |
| Quick-add insert fails | `QuickAddTaskModal` shows its inline error and stays open |

### Performance

- Lazy-loaded (`lazyWithRetry`) like the other app-level overlays; wrapped in `Suspense fallback={null}`.
- Shares the `TaskEngine` 60s cache — opening the tray after the home/calendar warmed today's list is an instant `peekCache` paint.
- Assigned `Z.drawer` (80) from the ladder — below modals (120) and the toaster, above the header (50) and Deck (40). The `QuickAddTaskModal` (z-[100]) and TaskList's confirm overlays sit above it.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this

You're deep in the Shed, or the Planner, or reading a guide, and you want to glance at — or tick off — what's due today without losing your place. The tray is the answer: tap the checklist icon in the top bar and today's work slides in from the right, over whatever you're on. The little red number on the icon is your overdue count, so you always know if something's slipped.

### Every flow

1. **Open it** — tap the checklist icon in the header (top bar), on any screen.
2. **See today + anything overdue** — the same tidy list as your home, each row showing when it's due ("Overdue · was due Jul 16", "Due tomorrow").
3. **Tick it off** — the left checkbox completes a task right there. No navigation.
4. **Push it back** — the postpone button snoozes a task to another day.
5. **Add something** — the **+** opens a quick "Add a task" card (title, type, notes, date) for a one-off you don't want to forget.
6. **Go deeper** — "Open the full board" drops you into the Calendar for scheduling, bulk edits, and the Pending/Completed tabs.
7. **Close it** — the X, tapping the dimmed area, or Escape.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Checklist icon + red number (header) | Opens the tray; the number is your overdue task count |
| "Today's tasks" + "N overdue" pill | The tray's title and, if any, how many tasks are past due |
| Each task row | Type badge, title, a due-date line, context chips, and inline complete / postpone / delete |
| Due-date line | "Overdue · was due …", "Due tomorrow", "Due in N days", or a date — so overdue is never signalled by colour alone |
| **+** (top-right) | Quick-add a one-off task |
| "Open the full board" (bottom) | Jump to the Calendar for full management |

### Tier-by-tier experience

Identical for every tier.

### Common mistakes / pitfalls

- **Looking for it on a Garden Walk or the mobile planting helper.** Those are focus-mode screens with no header, so the trigger is hidden there by design.
- **Expecting the tray to be a full calendar.** It's the quick-glance + quick-act surface; scheduling, rescheduling by drag, and the Pending/Completed history live on the full board (the footer button).

### Recommended workflows

- **Mid-task check:** working somewhere else, tap the icon, tick off what you've just done, close.
- **"What have I missed?":** if the header number is non-zero, open the tray — the overdue rows sit up top with a plain-language "was due" date.

### What to do if something looks wrong

- **A task you just added isn't there:** the tray refreshes on quick-add and on each open — close and re-open if a change made elsewhere hasn't landed.
- **The icon isn't in the header:** you're on a focus-mode screen (Garden Walk / planting helper) — leave it and the header returns.

---

## Related reference files

- [Header / Top Bar](./01-header.md) — hosts the tray trigger
- [Home (Main Dashboard)](../02-dashboard/17-home-main.md) — renders the same compact TaskList; the tray complements it on non-home screens
- [Quick Add Task Modal](../08-modals-and-overlays/35-quick-add-task-modal.md) — the slim add-task the **+** opens
- [Add Task / Edit Schedule Modal](../08-modals-and-overlays/01-add-task-modal.md) — the full task editor behind row taps
- [Calendar Tab](../02-dashboard/03-calendar-tab.md) — the full board the footer button opens
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — ghosts, blueprints, the TaskEngine
- [Design System](../99-cross-cutting/40-design-system.md) — the `Z` ladder + ModalShell `drawer` variant

## Code references for ongoing maintenance

- `src/components/TodayTasksTray.tsx` — the tray (ModalShell drawer + compact TaskList + quick-add + board link)
- `src/components/ui/ModalShell.tsx` — the `drawer` variant added for this surface (right-anchored, full-height, slide-in-from-right; reuses portal / focus trap / shared Escape stack)
- `src/App.tsx` — `trayOpen` state, the header `today-tasks-tray-trigger` (+ overdue badge), and the app-level mount next to `MobileNavDrawer` / `CaptureSheet`
- `src/components/TaskList.tsx` — the compact list the tray embeds (per-row inline actions + the B2 due-date label)
- `src/components/quick/QuickAddTaskModal.tsx` — the quick-add the **+** opens
- `src/lib/taskEngine.ts` — `peekCache` / `fetchTasksWithGhosts` (shared cache) + `invalidateCache`
- `tests/e2e/specs/today-tasks-tray.spec.ts` — TRAY-001..004 + TRAY-010 (focus-mode suppression)
