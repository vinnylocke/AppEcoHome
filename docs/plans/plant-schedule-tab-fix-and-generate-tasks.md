# Plant Schedule tab — fix the spinner + add "Generate Tasks" button

## Two problems

### Problem 1 — Automations tab spins forever

When you open a plant from the Shed and click the **Automations** tab, the spinner never resolves. The component is [`PlantScheduleTab`](src/components/PlantScheduleTab.tsx).

Inspecting the code, the loading path is:

```ts
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchSchedules();   // sets loading=false in finally
  fetchHomeData();    // doesn't touch loading
}, [plant.id, homeId]);
```

`fetchSchedules` has a try/catch/finally, so `setLoading(false)` *should* always run. But the symptom is a hang, so one of:

- `plant.id` is undefined → PostgREST returns an error → finally fires → but the catch path only sets a generic `fetchError` flag and the UI doesn't surface the actual cause.
- `homeId` is empty / mismatched → unrelated to this query, but masks an error path.
- A genuine network/RLS hang on the underlying query.
- Component is unmounted mid-await (race when activeTab flips back fast) → React drops the state update.

The right fix is to **harden the load path** with:

1. Early-return when `plant?.id` is missing (don't kick off a malformed query).
2. AbortController on the query so unmounting cancels the fetch cleanly.
3. Surface the *actual* error message in the failure state instead of a generic "Could not load" — so the next time it hangs/fails we'll know exactly why.
4. Log a console error (dev) + Sentry (prod) on failure so we can trace it remotely.

This is a targeted fix that doesn't require knowing the precise root cause — it'll either resolve the hang OR show us exactly what's wrong on the next reproduction.

### Problem 2 — Per-schedule "Generate Tasks" button

The user wants each row in the schedules list to have a **Generate Tasks** button that:

- Lets you specify a **trigger date** (defaults to today).
- Mocks the "Planted" / "Added to Area" trigger so tasks can be generated even when the plant hasn't been placed in a real area yet — the inventory_item_ids stays empty.
- Optionally lets you attach the generated blueprint to specific inventory items if you have them.
- Optionally caps how many occurrences to generate (so you can test/preview).

Today the **only** ways to generate tasks from a schedule are:

- The "Apply to existing plants" checkbox when saving (one-shot, doesn't support a fake trigger).
- The Auto-Generate seasonal flow (generates ALL schedules for ALL planted instances).

We need a per-schedule, on-demand path.

## App-reference files consulted

- [`docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md`](docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — confirms PlantScheduleTab is the Automations tab on the Plant Edit Modal, opened from The Shed.
- [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](docs/app-reference/99-cross-cutting/04-data-model-tasks.md) — confirms `task_blueprints` holds the recurrence rule + `tasks` are the actualised instances; `BlueprintService.generateBlueprintTasks(blueprintId)` is the public hook for generating tasks from a blueprint.

---

## Files & changes

| File | Change |
|---|---|
| `src/components/PlantScheduleTab.tsx` | (1) Harden the load path — early-return on missing plant.id, AbortController, surface actual error, log to Sentry. (2) Add a "Generate Tasks" button to each schedule row. |
| `src/components/PlantScheduleGenerateTasksModal.tsx` | NEW — small portal modal with the trigger date picker, optional inventory selector, "Generate" CTA. Reuses the existing `getDatesForBlueprint` helper extracted from PlantScheduleTab. |
| `src/lib/plantScheduleGenerator.ts` | NEW — extracted pure function `buildBlueprintFromSchedule({ schedule, plant, triggerDateStr, currentYear })` that mirrors the existing `getDatesForBlueprint` logic. Keeps the modal logic testable. |
| `tests/unit/lib/plantScheduleGenerator.test.ts` | NEW — covers trigger-date math (today vs future, with/without seasonal references, perennial cap behaviour). |

---

## "Generate Tasks" modal — UX

Triggered by a wand/play icon button next to the Edit + Delete buttons on each schedule row.

```
┌──────────────────────────────────────────────┐
│ Generate Tasks                            ✕  │
│ for "Weekly Deep Watering" (Watering)        │
├──────────────────────────────────────────────┤
│ Trigger date                                 │
│ [date input — defaults to today]             │
│                                              │
│ Attach to inventory items? (optional)        │
│ ☐ Cucumber #1 (Back Garden › Bed A)          │
│ ☐ Cucumber #2 (Back Garden › Bed A)          │
│ Leave unchecked to create a free-floating    │
│ blueprint with no linked items.              │
│                                              │
│ Limit occurrences? (optional, advanced)      │
│ [ ] stop after N tasks                       │
│                                              │
│ [Cancel]                 [Generate Tasks ▶]  │
└──────────────────────────────────────────────┘
```

On Generate:

1. Compute `start_date` / `end_date` via `buildBlueprintFromSchedule` using the picked trigger date.
2. Insert a `task_blueprints` row with `is_auto_generated = false`, optional `inventory_item_ids`, optional location/area inherited from the picked inventory item (if any).
3. If `start_date <= today`, call `BlueprintService.generateBlueprintTasks(blueprintId)` so the first task lands in the calendar immediately.
4. Show a success toast: "Generated N tasks for [schedule name]". Link to the calendar.

---

## Risks & edge cases

- **No inventory items selected, no area / location** — the blueprint gets created without area/location, which is fine; the engine handles location-less blueprints by surfacing the task in the user's calendar without an area badge. Confirmed by reading existing `task_blueprints` schema (location_id + area_id are nullable).
- **Trigger date in the past** — `getDatesForBlueprint` already floors `start_date` to today when the computed start would be in the past, so historical mocks still produce a sensible first task.
- **Seasonal start_reference** (e.g. "Spring Harvest Start") — the `start_reference` is a date pattern, NOT the trigger date itself. The picker only mocks the *trigger event date*; seasonal references are still computed against the current year. This matches existing semantics.
- **Spinner fix without root cause** — see Problem 1 above; the hardened code surfaces errors instead of guessing.

---

## Steps

1. Extract `buildBlueprintFromSchedule` into `src/lib/plantScheduleGenerator.ts` + unit tests.
2. Harden the load path in `PlantScheduleTab.tsx`.
3. Add the Generate Tasks button + new modal component.
4. Typecheck + unit tests.
5. Deploy. (No DB migration needed.)
