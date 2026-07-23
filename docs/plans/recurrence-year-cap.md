# Plan — "Repeat every year" year-count cap

**Status:** Approved (design chosen 2026-07-23) — extends the Track B recurrence toggle.

## Goal
Let users cap annual recurrence at **N years** instead of only "forever". Chosen UI: the existing **"Repeat every year" checkbox** + an optional **"Stop after N years (blank = forever)"** number input. Lifecycle-derived routines pre-fill the value.

## Semantics (no schema/engine change — reuses `recurs_until`)
"Repeat for N years" = **N annual windows** (year Y … Y+(N−1)). Maps to:
- checkbox OFF → `recurrence_kind='once'`, `recurs_until=null`
- checkbox ON + blank → `recurrence_kind='annual'`, `recurs_until=null` (forever)
- checkbox ON + N → `recurrence_kind='lifecycle_capped'`, `recurs_until = start + (N−1) years`

Lifecycle pre-fill: perennial → forever (blank); biennial → **2**; annual → off (once).
This also **fixes** the current biennial default (`+2yr` → 3 windows) to exactly **2 windows** (`recurs_until = start + 1yr`).

## App-reference consulted
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — recurrence_kind/recurs_until contract
- [04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md), [08-modals-and-overlays/01-add-task-modal.md](../app-reference/08-modals-and-overlays/01-add-task-modal.md)

## Files
- **NEW `src/lib/recurrence.ts`** — pure `deriveRecurrence(start, repeatAnnually, repeatYears)` → `{recurrence_kind, recurs_until}` and `yearsFromRecurrence(start, kind, recurs_until)` → `{repeatAnnually, repeatYears}` (for form init). + unit test.
- `src/components/AddTaskModal.tsx` — form uses `repeatAnnually`/`repeatYears`; init via `yearsFromRecurrence`; UI checkbox + optional number; 4 write paths call `deriveRecurrence`; reset-on-clear; isDirty.
- `src/components/InstanceCareRoutine.tsx` — same on the create path.
- `src/lib/plantScheduleGenerator.ts` + `src/components/PlantScheduleTab.tsx` — biennial → `recurs_until = start + 1yr` (2 windows); update generator test.
- Docs: extend the recurrence-kind section in 04-data-model-tasks.md (N-year cap + fixed biennial semantics).

## Tests
- Unit: `deriveRecurrence` / `yearsFromRecurrence` round-trip (once / annual / N=1 / N=3 / forever); generator biennial → 2-window recurs_until.

## Then
E2E (deferred item): author an annual routine → verify carry-over.
