# RHO-19 — Late completion shows as "on time" on the due day

**Ticket:** RHO-19 "Garden Walkthrough — Completing an Overdue Task completes it on wrong day"
**Reported:** Sprout tier, Pixel Tablet landscape PWA, v34.0001
**Status target:** In Planning → awaiting human approval. **No code in this task.**

---

## 1. Symptom (from the ticket)

On the Garden Walk, completing an **overdue** task (e.g. one due *yesterday*) correctly
removes it from the overdue list and correctly leaves it on its original due day in the
calendar — **but the calendar renders it as if it was completed on time.** Expected: it
stays on its due day AND clearly shows it was completed **late**, with the actual
completion date visible.

Note the ticket title says "wrong day", but the reproduction body clarifies the task
*does* stay on its due day; what's wrong is that the due-day view gives **no late signal**.
So this is a **display / annotation bug**, not a date-write bug. The completion write is
correct (see §3).

---

## 2. App-reference files consulted

- `docs/app-reference/02-dashboard/03-calendar-tab.md` — calendar tab contract; the legend
  already documents **Amber ✓ = "Done, but late"** (line 246) and the overdue/missed marks,
  and states past-day agenda shows carryover with a "carrying over since…" label (line 217).
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — `tasks.completed_at`
  (timestamptz) + `completed_by`; `completeTask` keeps `due_date`, only sets
  `status='Completed'` + `completed_at=now`; the shared `src/lib/taskActions.ts` mutation core.
- `docs/plans/RHO-17-garden-walk-detail.md` — Garden Walk v2; walk completion goes through
  `taskActions.completeTask` (identical write path to TaskList), so the walk is not doing
  anything special — the calendar rendering is the single point to fix.
- `docs/plans/calendar-overdue-visualization.md` — the original design of the
  green ✓ / red ✓ / red ✗ / faint ✕ cell indicators and the
  `overdueCarryoverSince` / `lateCompletionFrom` agenda annotations. This bug is a **gap in
  that same design** (see §3).

Source read end-to-end: `src/lib/taskActions.ts` (`completeTask`), `src/components/walk/WalkTaskRow.tsx`
(walk complete action → `completeTask`), `src/components/TaskCalendar.tsx`
(`getTasksForDate`, `getCellIndicators`, `agendaTasks`, cell render), `src/components/TaskList.tsx`
(the `lateCompletionFrom` / `overdueCarryoverSince` chips, ~lines 1225–1257),
`src/lib/taskEngine.ts` (`isTaskOverdue`, `getLocalDateString`, harvest-window helpers),
`src/lib/dateUtils.ts` (`getLocalDateString` re-export + `formatDisplayDate`).

---

## 3. Root cause (file:line)

The write is correct. `completeTask` (`src/lib/taskActions.ts:104–148`) sets
`status='Completed'`, `completed_at = new Date().toISOString()` (today), `completed_by`, and
**keeps `due_date`** (yesterday). That's exactly right — the task stays on its due day.

The calendar already has a "late" concept, but it is only surfaced on the **completion-day**
view, never on the **due-day** view. Two places:

### 3a. Agenda (right-hand list) — the primary bug

`TaskCalendar.tsx` `agendaTasks` (`src/components/TaskCalendar.tsx:270–303`):

- `baseTasks = getTasksForDate(selectedDate)` — `getTasksForDate`
  (`src/components/TaskCalendar.tsx:205–217`) matches on `t.due_date === dateStr` with **no
  status filter**, so when you select the **due day (yesterday)** the completed task IS in
  `baseTasks` — but as a **plain Completed task with no annotation**.
- The `lateCompletions` branch (`src/components/TaskCalendar.tsx:288–300`) that attaches the
  `lateCompletionFrom` flag only fires when
  `t.completed_at.slice(0,10) === dateStr` — i.e. only when the selected day IS the
  **completion day (today)**. On the **due day**, `completed_at` (today) ≠ `dateStr`
  (yesterday), so **`lateCompletionFrom` is never attached to the due-day copy**.

Result: on the due day, `TaskList` renders the task as an ordinary completed row (green
tick, strike-through, no chip — `src/components/TaskList.tsx:1225–1236` only shows the
"Completed late — due …" chip when `task.lateCompletionFrom` is set). **This is the "looks
completed on time" the ticket describes.**

### 3b. Grid cell dots — secondary, same root cause

`getCellIndicators` (`src/components/TaskCalendar.tsx:234–268`):

- `greenCount` (on-time ✓) requires `completed_at.slice(0,10) === dateStr` **AND**
  `due_date === dateStr` (line 246–252).
- `redCheckCount` (late ✓) requires `completed_at.slice(0,10) === dateStr` **AND**
  `due_date < dateStr` (line 254–260).

Both are keyed to the **completion-day** cell. On the **due-day** cell of a late completion,
`completed_at` (today) ≠ `dateStr` (yesterday), so **neither** fires → the due-day cell shows
**no indicator at all** for this task. The amber "late ✓" correctly lands on the *completion*
day, but the due day is blank, which is what makes the calendar read as if nothing notable
happened on the due day. (The green ✓ never appears for this task — good — but the due day
has no marker to say "this was completed, just late".)

### 3c. Latent UTC-slice bug (must be fixed in the same pass — the prompt flagged it)

Both 3a and 3b compare `t.completed_at.slice(0,10)` (a **UTC** date slice of a `timestamptz`)
against `dateStr` (a **LOCAL** calendar day from `getLocalDateString`). This is the exact
UTC-slice-vs-local class of bug fixed earlier this session in `taskEngine`'s
completed-in-window filter (`src/lib/taskEngine.ts:334–343`, which now does
`getLocalDateString(new Date(timestamp))`). Here it is **not** fixed: an evening completion
west of UTC (e.g. Pixel Tablet at 20:00 local rolls to next-day UTC) slices to the wrong
calendar day, so the late ✓ / late chip can land a day off. The "is late" predicate below must
use the **local** date of `completed_at`, and the cell/agenda date matching must too.

---

## 4. The exact "is late" predicate

Add one pure helper to `src/lib/taskEngine.ts` (co-located with `isTaskOverdue` /
`getLocalDateString`, unit-testable, reused by both the agenda and the cell path):

```ts
/** True if this Completed task was finished AFTER the day it was meant to be done.
 *  Late means: completed_at's LOCAL calendar day > the task's effective due day.
 *  - Only Completed tasks with a completed_at can be "late".
 *  - Window (harvest) tasks compare against window_end_date, NOT due_date — a
 *    harvest logged any day inside its open window is on time; only after the
 *    window closes is it late.
 *  - Snooze (next_check_at) is irrelevant here: it only moves *pending* visibility,
 *    it never changes the deadline a completion is judged against.
 *  Returns the effective due day (YYYY-MM-DD) when late, else null — callers use
 *  it for the "due N" copy without recomputing. */
export function lateCompletionDueDate(
  task: { status?: string; completed_at?: string | null; due_date?: string | null;
          window_end_date?: string | null },
): string | null {
  if (task.status !== "Completed" || !task.completed_at || !task.due_date) return null;
  const completedLocal = task.completed_at.includes("T")
    ? getLocalDateString(new Date(task.completed_at))   // timestamptz → LOCAL day
    : String(task.completed_at).slice(0, 10);            // date-only fallback
  const deadline = (task.window_end_date
    ? String(task.window_end_date)
    : String(task.due_date)).slice(0, 10);
  return completedLocal > deadline ? deadline : null;
}
```

Key correctness points:
- **Window/harvest:** deadline = `window_end_date`, so a harvest completed *inside* its
  window is never flagged late (matches `isTaskOverdue`'s window branch,
  `src/lib/taskEngine.ts:29–31`). Only a harvest completed after the window closes is late,
  and the chip then reads "due {window close}".
- **Snooze:** deliberately ignored. `next_check_at` only hides a *pending* task; once
  completed it plays no part in whether the completion was late. (A harvest snoozed then
  completed inside the window is still on time.)
- **Local date:** fixes §3c — no UTC slice.

---

## 5. The fix

### 5a. `src/components/TaskCalendar.tsx` — annotate the due-day copy too

In `agendaTasks` (lines 270–303), when the selected day is a **past due day**, also annotate
any completed task in `baseTasks` whose `lateCompletionDueDate(...)` equals the selected day
with `lateCompletionFrom = <that due day>` (and add `lateCompletedOn = completed_at`'s local
day so the chip can show the *actual completion date*, see §6). Concretely: map `baseTasks`
through a helper that, for a Completed task where `lateCompletionDueDate(t) === dateStr`,
attaches `{ lateCompletionFrom: dateStr, lateCompletedOn: <local completed day> }`.

Keep the existing `lateCompletions` branch (it correctly surfaces the same task on its
*completion* day too), but re-express both in terms of `lateCompletionDueDate` so the two
paths share one predicate and both carry `lateCompletedOn`.

Net effect: the late task now shows the "Completed late" chip on **both** the due day (its
persistent home) and the completion day.

### 5b. `src/components/TaskCalendar.tsx` — grid cell: mark the due day of a late completion

In `getCellIndicators` (lines 234–268), rework using `lateCompletionDueDate`:
- Replace the `.slice(0,10)`-based `greenCount` / `redCheckCount` with local-day comparisons
  (fixes §3c).
- `greenCount` (on-time ✓): Completed, `lateCompletionDueDate(t) === null`, and the task's
  **due day** (local) === `dateStr`. (On-time completions land on their due day, which is
  also the completion day — unchanged behaviour.)
- `redCheckCount` (late ✓) stays on the **completion** day (unchanged — that's where the
  "you did it, just late" belongs).
- **New:** add a marker on the **due day** of a late completion so the due-day cell isn't
  blank. Recommended: reuse the amber late ✓ glyph on the due-day cell too (a small amber ✓),
  OR a dedicated subtle "late-origin" mark. Decision below (§6) — recommend the amber ✓ on
  the due day, matching the legend's existing "Amber ✓ = Done, but late".

### 5c. `src/components/TaskList.tsx` — show the actual completion date in the chip

The chip at `src/components/TaskList.tsx:1232–1236` currently reads
`Completed late — due {formatDisplayDate(task.lateCompletionFrom)}`. Extend it to also show
**when** it was actually completed, per the ticket ("with the actual completion date shown"):

```
Completed late — due {formatDisplayDate(lateCompletionFrom)} · done {formatDisplayDate(lateCompletedOn)}
```

`lateCompletedOn` is the new field from §5a (local completion day). This is a copy-only change
plus reading the new field; no new prop.

### Why the calendar is the only place to fix (not the walk or `taskActions`)

The walk completes via `taskActions.completeTask` — the same write TaskList uses — and the
write is correct. The gap is purely in how the calendar *reads back* a completed task on days
other than its completion day. Fixing it in `TaskCalendar` (+ the shared predicate + the chip
copy) covers every surface that shows the calendar; the walk needs no change.

---

## 6. Copy + placement decisions

- **Chip (agenda, both due day and completion day):**
  `Completed late — due 1 Jul · done 2 Jul` (amber, `CheckSquare` icon — extends the existing
  chip at TaskList:1232). Shows the real completion date per the ticket.
- **Grid cell — due day:** amber ✓ (reuse existing "Amber ✓ = Done, but late" legend entry).
  This makes the due-day cell non-blank and signals lateness without a new legend symbol.
- **Grid cell — completion day:** amber ✓ unchanged (already correct).
- **On-time completions:** unchanged (green ✓ on the due/completion day).
- **Harvest inside window:** never late; no chip, no amber mark (predicate returns null).

Open question O1 (below) covers whether the same due-day amber ✓ + chip should also appear on
the plain Today/Dashboard task list, or stay calendar-only.

---

## 7. Tests to add

**Vitest — `tests/unit/lib/taskOverdue.test.ts`** (co-located with the window-task matrix):
- `lateCompletionDueDate`:
  - completed **after** due day → returns the due day.
  - completed **on** due day → null (on time).
  - non-Completed / missing `completed_at` → null.
  - **window task** completed inside the window → null; completed after
    `window_end_date` → returns `window_end_date`.
  - **UTC-slice guard:** a `completed_at` late-evening timestamp that is next-day in UTC but
    same local day as the due date → **null** (proves the local-date fix; would fail on the
    old `.slice(0,10)`).

**Playwright — `tests/e2e/specs/` + Page Object:**
- Extend the calendar spec (RHO-19): seed a Pending task due *yesterday*, complete it "today"
  (via the agenda or walk), then assert:
  - selecting **yesterday** (due day) shows the row with the "Completed late — due … · done …"
    chip;
  - the **yesterday** grid cell carries the amber late marker (`data-*` hook — add e.g.
    `data-late-origin` / reuse the amber-✓ count attribute);
  - selecting **today** still shows the amber late ✓.
  Reference RHO-19 in the test name. Seed: a completed-late task in `03_tasks_blueprints.sql`
  (physical task, `blueprint_id = NULL`, `due_date = CURRENT_DATE - 1`,
  `status='Completed'`, `completed_at = now()`), plus its UUID in
  `docs/e2e-test-plan/01-seeded-fixtures.md`.

**Deno:** none — no `_shared` change.

---

## 8. Docs to update (same task as the code lands)

- `docs/app-reference/02-dashboard/03-calendar-tab.md` — document that a late completion shows
  the amber ✓ on **both** its due day and completion day, and that the agenda chip now shows
  the actual completion date; note `lateCompletionDueDate` as the predicate. (The legend
  already lists Amber ✓ = late, so only the "on both days" nuance + completion-date copy are new.)
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — one line under the
  `taskActions` section: completion keeps `due_date`; lateness is derived at render time via
  `lateCompletionDueDate` (local `completed_at` vs `window_end_date ?? due_date`).
- `docs/e2e-test-plan/` — add the RHO-19 rows to the calendar surface file
  (`docs/e2e-test-plan/03-calendar.md` or the dashboard/calendar file that exists) and the
  seed UUID to `01-seeded-fixtures.md`; bump counts in `TESTING.md` if a new spec/PO lands.

---

## 9. Risks / edge cases

- **UTC-slice regression** — the whole point of §3c/§4; unit-tested with the evening-timestamp
  case. Do NOT reintroduce `.slice(0,10)` on `completed_at` for day comparisons.
- **Window/harvest false-late** — a harvest completed inside its window must NOT flag late;
  the predicate uses `window_end_date` as the deadline. Covered by a unit case.
- **Double display** — the task now appears (annotated) on both due day and completion day.
  That's intended and matches the existing `lateCompletions` (completion day) + carryover
  (due day) model; the two are on different selected dates so there's no duplication within a
  single agenda view.
- **`completed_at` null on old rows** — predicate returns null → renders as a plain completed
  task (graceful; same as today).
- **On-time completion unaffected** — `lateCompletionDueDate` returns null when completed on
  its due day, so green ✓ / plain chip behaviour is unchanged.
- **Fetch range** — a late completion whose due day is outside the calendar's ±1-month
  `tasks` fetch won't annotate on that (out-of-range) due day. Pre-existing limitation of the
  original design (documented in `calendar-overdue-visualization.md`); not widened here.

---

## 10. Open questions for the human

- **O1 — scope of the due-day late signal:** fix on the **calendar only** (agenda + grid), or
  also surface the "Completed late — due X · done Y" chip on the plain Dashboard/Today task
  list when it shows a completed task on a past due day? Recommend calendar-only for this
  ticket (that's where the reporter saw it); the TaskList chip already renders whenever the
  annotation is present, so extending later is cheap.
- **O2 — due-day grid glyph:** reuse the existing **amber ✓** on the due-day cell (recommended,
  no new legend symbol), or introduce a distinct "late-origin" mark to visually separate
  "was due here, done late" from "done here, late"? Recommend reuse.
