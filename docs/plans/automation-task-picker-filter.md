# Automation builder — filter/search the task & sensor pickers

**Feedback:** *"Allow filters to tasks in the automation or a better way to hide them and find just the ones you are interested in, otherwise list will get clogged up pretty quickly — tasks appear in the trigger and in the action."*

## Problem

Recurring tasks (`task_blueprints`) surface in **two** places in the unified automation builder, both rendering the *entire* home's recurring blueprints with no search/filter:

1. **Trigger** — the `task_due` condition leaf renders every blueprint as a wall of toggle chips (`TaskFields` in [ConditionNodeEditor.tsx:153-172](../../src/components/integrations/ConditionNodeEditor.tsx#L153-L172)).
2. **Action** — the `complete_task` action renders every blueprint in a native `<select>` ([AutomationBuilderModal.tsx:278-281](../../src/components/integrations/AutomationBuilderModal.tsx#L278-L281)).

The same chip-wall problem affects the **sensor picker** (`SensorFields`) on homes with many devices.

For a busy garden with dozens of recurring tasks the chip wall becomes unusable on mobile.

## App-reference consulted

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — builder structure, condition-leaf list, action kinds.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `automation_actions`, `task_due` leaf, `complete_task`.

## Approach

Purely client-side, no schema or engine change.

1. **`TaskFields` (trigger chips)** — when `ctx.blueprints.length` exceeds a small threshold (e.g. 6), render a search `<input>` above the chips that filters by case-insensitive title substring. Selected-but-filtered-out blueprints stay selected (we only hide chips from the *list*, never silently deselect) — show a small "N selected" count so hidden selections are visible. `data-testid="task-leaf-search"`.
2. **`SensorFields` (sensor chips)** — same treatment with the same threshold and `data-testid="sensor-leaf-search"`.
3. **`complete_task` action** — the native `<select>` is already a compact dropdown, but for parity add a lightweight type-ahead filter input above it when the blueprint count is high (`data-testid="action-blueprint-search-{i}"`). Lower priority than the trigger chips; include only if it stays simple.

Filter state is local component state inside each leaf editor — no persistence needed.

## Files changing

| File | Change |
|------|--------|
| [src/components/integrations/ConditionNodeEditor.tsx](../../src/components/integrations/ConditionNodeEditor.tsx) | Add filter input + filtered render to `TaskFields` and `SensorFields`; keep selected items selected when filtered out. |
| [src/components/integrations/AutomationBuilderModal.tsx](../../src/components/integrations/AutomationBuilderModal.tsx) | (Optional) filter input above the `complete_task` blueprint select. |

## Tests

- **Playwright** — extend the automations spec / Page Object: typing in the task-leaf search narrows the chip list; a previously-selected hidden task remains in the saved tree. Update the affected Page Object selectors per the new `data-testid`s.
- No `src/lib` pure logic added, so no Vitest needed unless we extract a `filterByTitle` helper (only if it earns reuse).

## App-reference to update

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — note the searchable task/sensor pickers in the builder description + Role 2 "Every flow".

## Risks / edge cases

- **Hidden selections.** Filtering must never deselect — only hide from the list. The "N selected" affordance covers this.
- **Threshold tuning.** Below the threshold the input would be noise; gate it behind a count so small homes are unaffected.
