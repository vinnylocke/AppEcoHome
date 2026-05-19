# Plan — Phase 2 Wave 3: Task & Calendar Polish

Implements all 6 sub-items from the original Phase 2 plan in one ship. References [whole-app-overhaul-phase2.md § Wave 3](./whole-app-overhaul-phase2.md#wave-3--task--calendar-polish-2-days).

## Sub-items

### 3A. Task Calendar week view
- Add a "Month / Week" toggle in TaskCalendar header. Persist last-used view in localStorage (`rhozly_calendar_view`).
- Week view: 7 day columns, full task chips per day (not hour rows — overkill for gardening). Same indicator logic as month view but more breathing room per day.
- Same `selectedDate` state; week view scrolls week-at-a-time.

### 3B. Drag-reschedule
- Use **native HTML5 drag-and-drop** (no new dependency).
- Each task chip becomes `draggable`. Day cells become drop targets.
- On drop: `UPDATE tasks SET due_date = <new>` for real tasks; for ghost tasks, materialize first then update.
- Visual feedback: dragged chip shrinks; hovered drop target highlights.

### 3C. ICS export
- "Export to Calendar" button in the calendar header.
- Generates a `.ics` blob client-side covering all upcoming non-completed tasks in the next 90 days.
- One-shot download — not subscribe-able (deferred).
- Compatible with Google Calendar / Apple Calendar / Outlook imports.

### 3D. Blueprint Manager: pause + conflict detection
- **Migration**: `ALTER TABLE task_blueprints ADD COLUMN paused_until timestamptz;`
- Per-blueprint dropdown: "Pause" → 1 week / 2 weeks / until DATE / resume now.
- TaskEngine skips ghost-task generation for blueprints where `paused_until > now()`.
- **Conflict detection**: when saving a new blueprint, compare its cadence × scope (area_id, plant_ids) against existing blueprints. If overlap → warn "This may duplicate an existing schedule on the same area" with a "Save anyway" override.

### 3E. AddTaskModal: generate-from-photo
- "Photograph the task" button in AddTaskModal → uploads via PhotoUploader (re-using Wave 2's component) → calls new edge function `generate-task-from-photo`.
- Edge function calls Gemini Vision with: "From this garden photo, suggest a task. Return JSON: { title, description, type (Watering|Pruning|Harvesting|Maintenance|Planting), frequency_days }."
- Returned values pre-fill the form. User edits + saves.

### 3F. Optimise Tab: whole-garden mode + weekly digest
- New toggle in OptimiseTab header: "Single area" / "Whole garden". Whole-garden runs the optimiser across every blueprint at once.
- Weekly digest opt-in: new toggle in Gardener Profile → Notifications ("Weekly optimise digest"). Already exists per recent commits — verify wiring.

## Migrations

- `20260602000000_blueprint_paused_until.sql` — adds `paused_until` column + index for the TaskEngine filter.

## New files

- `src/lib/icsExport.ts` — pure utility to build the ICS string.
- `supabase/functions/generate-task-from-photo/index.ts` — Gemini Vision edge function.

## Files modified

- `src/components/TaskCalendar.tsx` — view toggle, week-view layout, drag handlers, ICS button.
- `src/components/BlueprintManager.tsx` — pause control + conflict warning.
- `src/components/AddTaskModal.tsx` — photo-to-task entry point.
- `src/components/OptimiseTab.tsx` — whole-garden toggle.
- `src/lib/taskEngine.ts` — respect `paused_until` when generating ghost tasks.

## Process

1. Apply migration locally → typecheck → ship migration via deploy.
2. Implement UI pieces.
3. Verify all six surfaces in browser.
4. Deploy together as one bundle.
