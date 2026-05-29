# Plan — Bulk delete (with End-of-Life choice) + bulk assign in Plants

Extends the Plants multi-select mode (`TheShed`) with two new bulk actions alongside the existing bulk Archive/Restore.

## App-reference files consulted
- `docs/app-reference/03-garden-hub/01-the-shed.md` — select mode + bulk action bar, single delete + assign
- `docs/app-reference/12-senescence.md` / `08-modals-and-overlays/37-lifecycle-complete.md` — End-of-Life state
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — plants ↔ inventory_items

## Today
- Select mode (`selectMode` + `selectedPlantIds`) shows a bottom bar with **Archive** (active view) / **Restore** (archived view) + Cancel. `bulkActionState` already has a `"deleting"` slot but no handler/button.
- Single **delete** now offers "Keep the history (End of Life)" vs "Delete everything" (just shipped). Single **assign** = `PlantAssignmentModal` (2-step: location→area + quantity + planted state, then optional AI smart-schedules) → `handleAssign` inserts `quantity` `inventory_items` per plant.

---

## Part A — Bulk delete (with End-of-Life choice)

Add a **Delete** button to the bulk bar (active view only). On tap, open a bulk delete dialog. Mirror the single-plant pattern at batch level:

- First, count instances across the selected plants (`inventory_items` where `plant_id in (selected)`).
- **If any selected plant has instances** → two batch outcomes:
  - **Keep the history** — for every selected plant: mark its still-active instances End of Life (`ended_at`, `was_natural_end = null`, `end_summary`, `status="Archived"`) + closing journal entries, then **archive** the plant (`is_archived = true`). Nothing deleted; instances land in Senescence; fully restorable.
  - **Delete everything** — delete all selected `plants` (cascades instances/tasks/journals) + clean up `task_blueprints` for the affected inventory ids.
- **If none have instances** → simple "Delete N plants permanently?" confirm → delete all.

`handleBulkDelete()` and `handleBulkEndOfLifeInstead()` generalise the single-plant `executeDelete` / `executeEndOfLifeInstead` to a set of ids (one batched query each where possible). `bulkActionState` flips to `"deleting"`.

**Decision (see below):** "Keep the history" archives *all* selected plants (safe) — including any with no instances — rather than deleting the instance-less ones.

## Part B — Bulk assign

Add an **Assign** button to the bulk bar (active view). Opens a new **`BulkAssignModal`**:
- **One target** for the whole batch: a location → area picker (reusing the `locations`→`areas` shape `PlantAssignmentModal` uses), plus an "Add to garden (no area yet)" option.
- **Per-plant quantity**: the selected plants listed, each with a quantity stepper (default 1, min 1).
- **Status**: Planted vs Unplanted (+ planted date when Planted), applied to the whole batch.
- **AI smart-schedules (decided: included):** a single **"Smart planting schedules"** toggle (shown when a real area is selected AND `aiEnabled`, on by default). When on, after the instances are created `handleBulkAssign` generates each plant's schedule via `smart-plant-scheduler` (reusing the `ai_schedule_cache`) and applies that plant's **recommended viable method** as Planting tasks — the same task shape `handleAssign` builds. Per-plant generation soft-fails independently (one plant's miss doesn't block the rest). This avoids an unwieldy N-plant method-picker while still giving AI schedules in bulk; the single-assign flow keeps full per-method choice.
- On confirm → `handleBulkAssign`: look up the shared area context once, then for each plant insert `quantity` `inventory_items` (reusing the per-row shape from `handleAssign`) in one combined insert, then (if the toggle is on) generate + apply schedules per plant. Toast "Assigned X plants across N types." `refreshShed()`.

## Files to change / add
- `src/components/TheShed.tsx` — Delete + Assign buttons in the bulk bar; `handleBulkDelete`, `handleBulkEndOfLifeInstead`, `handleBulkAssign`; bulk delete dialog (reuse/extend `DeleteWithInstancesModal` for the batch case, or a small batch variant); render `BulkAssignModal`.
- `src/components/BulkAssignModal.tsx` *(new)* — area picker + per-plant quantity + status.
- (Maybe) extract the per-row inventory insert shape into a small helper shared by `handleAssign` + `handleBulkAssign` to avoid drift.

## Tests
- E2E (shed-crud): select-mode → bulk **Delete** shows the choice dialog when selected plants have instances (non-destructive Cancel, like SHED-023c). Bulk **Assign** opens the modal, set quantities, pick an area, assign → instances created (resilient). Add ShedPage helpers + testids (`shed-bulk-delete`, `shed-bulk-assign`, `bulk-assign-modal`, per-plant qty inputs).
- Unit: if the insert-shape helper is extracted, a small test for it.

## App-reference docs to update
- `01-the-shed.md` — bulk bar now has Delete (with EOL choice) + Assign; document `BulkAssignModal`.
- New reference for `BulkAssignModal` (modals-and-overlays) + index entry.

## Risks
- Bulk delete is destructive across many rows — batch the queries, confirm clearly, and make "Keep the history" the safe default-styled action.
- Bulk assign inserts many rows — one combined insert; guard partial failures.
- Untestable here → verify on device.

## Open decisions for sign-off
1. **Bulk "Keep the history" on a mixed selection** (some plants have instances, some don't): archive *all* selected + EOL the instances *(recommended — nothing lost)*, vs only-archive-the-ones-with-instances and delete the rest *(more surprising)*. Plan assumes **archive all**.
2. **Bulk assign scope:** single target area for the batch + per-plant quantity + one Planted/Unplanted choice, **no AI smart-schedules** *(recommended — keeps bulk fast/simple)*, vs include the per-plant AI schedule step.

## Deploy
Frontend-only (no migration). One deploy, then push to `main`.
