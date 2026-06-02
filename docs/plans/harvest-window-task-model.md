# Plan — Harvest Window Task Model

## Context

Reported by Vinny: harvest tasks currently spawn every day during the harvest window, so a single tomato plant accumulates 60+ overdue tasks if the user can't harvest on day one. Postponing is repetitive; deleting is wrong (the user *does* want to harvest, just not yet). We need a calmer model that respects how harvesting actually happens — observationally, not on a calendar.

**Root cause** in [src/lib/plantScheduleFactory.ts:54](src/lib/plantScheduleFactory.ts#L54): auto-generated harvest blueprints use `frequency_days: 1`, so ghost generation [src/lib/taskEngine.ts:239-274](src/lib/taskEngine.ts#L239-L274) fires a fresh ghost every day inside the window.

User-approved direction (decided in conversation):
- **Full window-task model + AI ripeness check** for harvest tasks.
- **Green pill** styling distinct from overdue ("Harvest window · 12 days left").

## App-reference files consulted

- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](docs/app-reference/99-cross-cutting/04-data-model-tasks.md) — ghosts + materialisation
- [docs/app-reference/04-schedule/01-blueprint-manager.md](docs/app-reference/04-schedule/01-blueprint-manager.md) — recurring template authoring
- [docs/app-reference/08-modals-and-overlays/02-task-modal.md](docs/app-reference/08-modals-and-overlays/02-task-modal.md) — current task card actions
- [docs/app-reference/05-tools/02-plant-doctor.md](docs/app-reference/05-tools/02-plant-doctor.md) — `analyse_comprehensive` already returns `edibility.ripeness` + `estimated_days_until_ripe`

## Approach

### 1. Schema (one migration)

Two nullable columns on `public.tasks`:

```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS window_end_date date,
  ADD COLUMN IF NOT EXISTS next_check_at   date;

COMMENT ON COLUMN public.tasks.window_end_date IS
  'For Harvesting tasks generated from a windowed blueprint, the last day the harvest window is open. NULL for non-window tasks.';
COMMENT ON COLUMN public.tasks.next_check_at IS
  'For window tasks the user has snoozed via "Not yet" or AI ripeness. The task is hidden from Today/Calendar until this date.';
```

`task_blueprints` already carries the window (`start_reference` + `end_reference`); nothing changes there.

### 2. Ghost engine

In [src/lib/taskEngine.ts:215-275](src/lib/taskEngine.ts#L215-L275), split harvest blueprints out of the daily loop:

```ts
if (bp.task_type === "Harvesting" && bp.end_date) {
  // ONE ghost per window — due_date = window start, window_end_date = end.
  // No frequency_days iteration.
  const ghostStartIso = bp.start_date;
  if (ghostStartIso <= endDateStr && bp.end_date >= startDateStr) {
    const alreadyExists = rawTasks.some(
      (t) => t.blueprint_id === bp.id && t.due_date === ghostStartIso,
    ) || tombstoneSet.has(`${bp.id}:${ghostStartIso}`);
    if (!alreadyExists) ghosts.push({
      id: `ghost-${bp.id}-${ghostStartIso}`,
      blueprint_id: bp.id,
      // …shared fields…
      due_date: ghostStartIso,
      window_end_date: bp.end_date,
      type: "Harvesting",
      status: "Pending",
      isGhost: true,
    });
  }
  return;
}
// existing daily loop for other types
```

When `materializeTask` writes the real `tasks` row, copy `window_end_date` through.

### 3. Visible-tasks filter

Wherever Today/Calendar reads "pending tasks for date X", add a guard:
- If `next_check_at` is set and `next_check_at > today`, hide it.
- If `window_end_date` is set: the task is "active" from `due_date` through `window_end_date` (anywhere in that range counts as on today's list).

This means a harvest task with a 90-day window stays in Today for 90 days, but only nags once: at `window_end_date + 1`.

### 4. Overdue semantics

Today, overdue = `status === "Pending" AND due_date < today`. For window tasks:

```ts
const isOverdue =
  task.status === "Pending"
  && (task.window_end_date
        ? task.window_end_date < todayStr   // overdue only past window end
        : task.due_date < todayStr);
```

One place to change: an `isTaskOverdue(task, todayStr)` helper in `src/lib/taskEngine.ts`. Every consumer (TaskList, TaskCalendar, dashboard counters) gets refactored to call it. New unit test `tests/unit/lib/taskOverdue.test.ts` covers the matrix.

### 5. Task-card UI

In [src/components/TaskModal.tsx](src/components/TaskModal.tsx), when `task.window_end_date` is set and `task.type === "Harvesting"` and `task.status === "Pending"`:

**Window pill** above the title:
```tsx
<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
  Harvest window · {daysLeft} days left
</div>
```

**Replace the default "Complete" / "Skip" buttons with three options**:

1. **🌾 Harvested** — marks done, opens the existing yield-log sheet (already exists for Harvesting type).
2. **🕒 Not yet** — opens a tiny popover: "Check again in 3 days / 5 days / 7 days". Picks → writes `next_check_at = today + N`. Hidden from Today until that date. Toast: *"Snoozed until {date} — still inside your harvest window."*
3. **✨ Check with AI** — opens the existing photo-capture inline (reuse `PlantDoctor`'s capture component). Sends `analyse_comprehensive` with `targetPlant = task.plant_name`. On result:
   - `edibility.ripeness === "ripe"` → toast *"AI says ripe — go pick!"*, opens yield-log directly.
   - `ripeness === "near_ripe"` → set `next_check_at = today + (estimated_days_until_ripe ?? 3)`. Toast.
   - `ripeness === "not_yet"` → set `next_check_at = today + (estimated_days_until_ripe ?? 7)`.
   - `edibility === null` → toast "Couldn't tell from this photo" + fallback to manual "Not yet" buttons.

After `window_end_date`:
- Window pill flips to amber "Window closed yesterday" with two actions: **Log yield anyway** | **Mark missed** (Skipped status). No more snooze.

### 6. Task list / Today render

In TaskList + LocalizedTaskCalendar, render window tasks with a left-edge green stripe + the "12 days left" sub-line. Reuses the existing card; just a conditional className.

### 7. AI ripeness wiring

Already supported by `analyse_comprehensive` ([supabase/functions/plant-doctor/index.ts](supabase/functions/plant-doctor/index.ts)) — its response has `edibility: { is_edible, ripeness, estimated_days_until_ripe, notes }`. New code is purely client-side:

- New small component `src/components/HarvestRipenessSheet.tsx` — photo capture + service call + branch on the ripeness verdict.
- Reuses `PlantDoctorService.analyseComprehensive` with `images: [PhotoInput]` (Wave-19 plumbing).
- Costs one Gemini call per check; bounded by the existing AI rate limiter.

### 8. plantScheduleFactory.ts

No structural change — harvest blueprints still carry start_reference/end_reference. Just **drop `frequency_days: 1`** from the harvest schedule shape (or set it to `0` / `null` for window blueprints) and lean on the engine's harvest branch to interpret the window.

Actually, keep the `frequency_days: 1` for back-compat on existing data — the engine branch keys on `task_type === "Harvesting" && end_date IS NOT NULL`. New blueprints created via this path keep using whatever the factory emits. Safe migration.

## Files changed

| File | Why |
|------|-----|
| `supabase/migrations/<ts>_harvest_window_tasks.sql` | `window_end_date`, `next_check_at` columns |
| `src/lib/taskEngine.ts` | Harvest ghost branch + `isTaskOverdue` helper + `next_check_at` filter |
| `src/components/TaskModal.tsx` | Window pill + Harvested / Not yet / Check with AI actions |
| `src/components/HarvestRipenessSheet.tsx` | New — photo capture + `analyse_comprehensive` call + verdict branch |
| `src/components/TaskList.tsx` | Window-task styling |
| `src/components/TaskCalendar.tsx` | Window-task styling on calendar dots |
| `src/components/quick/LocalizedTaskCalendar.tsx` | Window-task styling |
| `src/components/HomeDashboard.tsx` | Overdue counter uses `isTaskOverdue` helper |
| `src/lib/plantScheduleFactory.ts` | Comment update (no functional change) |
| `tests/unit/lib/taskOverdue.test.ts` | New — matrix of overdue scenarios for window vs non-window |
| `tests/unit/lib/taskEngine.test.ts` | Add harvest-window ghost generation cases |
| `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` | Document `window_end_date` + `next_check_at` |
| `docs/app-reference/08-modals-and-overlays/02-task-modal.md` | Document the three window-task actions |
| `docs/app-reference/00-INDEX.md` | (no new file needed) |

## Tests

- Unit: `isTaskOverdue` matrix (non-window past due, window in-progress, window past end, snoozed).
- Unit: harvest-window ghost generation — one ghost per window, not N.
- Unit: `next_check_at` filter — task hidden until date, visible after.
- E2E (optional): the manual "Not yet" → 5 days flow on a seeded harvest task.

## Migration / rollout

1. Apply migration locally → verify columns + comments.
2. Push to remote DB via deploy pipeline.
3. Existing harvest tasks already in `tasks` will keep their daily cadence until the user marks them complete or they age out — they don't have `window_end_date` and so behave exactly as before. New harvest ghosts (from blueprints with `end_date`) immediately use the window model.
4. A future small migration could backfill `window_end_date` on existing pending Harvesting tasks by reading the blueprint's `end_date`. Out of scope for v1.

## Risks

- `isTaskOverdue` refactor touches several consumers — keep the helper pure and test the matrix.
- AI ripeness call could time out / quota-exhaust during a manual check — falls back to the manual "Not yet" buttons.
- Window tasks with a >90-day window persist in Today for a long time; users could feel they're "always there". The green pill styling + "N days left" copy should mitigate, plus the "Not yet" snooze hides them between checks.

## Release notes

Major bump (`--bump-major`) — substantial new behaviour around a core concept.

## Open questions (for confirmation before code)

1. **Snooze choices on "Not yet"** — 3 / 5 / 7 days look reasonable. Want different defaults or a custom picker?
2. **Does the AI photo check feel like a feature you'd actually use on every harvest?** If not, we can hide it behind a tier gate or de-emphasise it (small icon vs button).
3. **Window closed behaviour** — "Mark missed" sets `status = Skipped`. That's irreversible from the UI today; do you want a "I did harvest, just late" path that still logs yield?
