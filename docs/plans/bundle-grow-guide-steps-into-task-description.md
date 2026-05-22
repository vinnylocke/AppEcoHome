# Plan — Bundle Grow Guide Steps into Calendar Task Descriptions

## Problem

When the gardener taps **Add to calendar** on a grow guide section, the calendar entry only carries the AI's short `description` from `schedulable_tasks` (e.g. "Pinch out side shoots between leaf nodes"). The detailed how-to `steps` for the section (e.g. propagation's 5-step cutting walkthrough) live in the guide UI but never travel with the task. Days later when the reminder fires, the gardener opens it and sees a one-liner — they have to come back to the grow guide to remember what to actually do.

Agreed direction from the conversation: bundle each section's `steps` into the primary task's description as a numbered checklist so the calendar entry is self-sufficient.

## App-reference files consulted

- [docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — Plant Edit Modal hosts the Grow Guide tab.
- [docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md](../app-reference/08-modals-and-overlays/36-grow-guide-tab.md) — Grow Guide tab reference (per-section + bulk Add to calendar flow).
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — Tasks / blueprints schema (target table for the descriptions).
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — AI output schema; confirms `steps` only populate action sections.

## Solution

Action sections (`propagation`, `germination`, `pruning`, `harvesting`) emit both `steps[]` and `schedulable_tasks[]`. Informational sections (`water`, `soil`, etc.) emit empty `steps[]`. So the rule is simple:

> For each section, if `steps.length > 0`, append a numbered checklist of those steps to the **first** `schedulable_task`'s description. Leave any subsequent tasks for the same section alone — they have their own discrete timing (e.g. germination's "Transplant seedlings" follow-up).

Resulting calendar entry description format:

```
{original AI description}

How to:
1. {step 1 title} — {step 1 detail}
2. {step 2 title} — {step 2 detail}
…
```

Year-round / informational sections (water, soil, sunlight, flowering, senescence) are a no-op since their `steps[]` is empty.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/scheduleFromSchedulableTask.ts` | Add `enrichDescriptionWithSteps(task, steps)` pure helper. Add `flattenSectionsForCalendar(sections)` helper that walks `{schedulable_tasks, steps}[]` and applies enrichment to the first task per section before flattening. |
| `src/components/growGuide/GuideSectionCard.tsx` | Build the enriched task array via the helper before passing to `AddToCalendarSheet`. |
| `src/components/GrowGuideTab.tsx` | Replace the inline `visibleSections.flatMap(...)` with `flattenSectionsForCalendar(visibleSections)`. |
| `tests/unit/lib/scheduleFromSchedulableTask.test.ts` | Add cases for the two new helpers — empty steps no-op, multi-step enrichment, multi-task section only enriching the first task. |

`AddToCalendarSheet.tsx` itself doesn't change — it still accepts `SchedulableTask[]`. The enrichment happens before the sheet receives the array, keeping the sheet's contract unchanged.

## App-reference Docs to Update

- `docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md` — Add a sentence to the Add to Calendar flow noting that the section's how-to steps are folded into the primary task's description.

## Edge cases

- **Section with no `steps`** → no change (informational sections, unaffected).
- **Section with `steps` but no `schedulable_tasks`** → nothing to add to the calendar in the first place; helper returns `[]`.
- **Section with multiple `schedulable_tasks`** → only the first task gets the steps. Second / third keep their original short description.
- **Existing tests** → none of the current assertions inspect description content, so they pass unchanged.

## Risks

- Description length: a 5-step propagation walkthrough adds ~400 chars. Well within Postgres `text` field tolerance and within the TaskModal UI's expandable description area.
- No DB schema change. No AI prompt change. No grow guide regeneration needed — every existing cached guide already has both fields. The enrichment is purely a client-side composition step.

## Process

1. Implement the helpers + wire the call sites.
2. Update the unit test.
3. Run `npx tsc --noEmit` and `npm run test:unit`.
4. Update the grow guide tab app-reference doc.
5. Deploy with `[skip ci]`.
