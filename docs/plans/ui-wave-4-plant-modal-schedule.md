# UI Wave 4 — Plant Edit Modal + Schedule Manager polish

## Goal

Lift two heavy-traffic surfaces toward 95+:
- **Plant Edit Modal** 78 → ~88
- **Schedule / Blueprint Manager** 82 → ~90

Investigation revealed most of the audit's "rename Blueprint → Task Schedule" was already done — the page heading, new-schedule button, and AddTaskModal all use user-friendly copy. The remaining gaps are smaller and targeted.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Tab consolidation in Plant Edit Modal? | **Defer** — 7 tabs is a lot but they don't naturally group. Real fix is a tab-strip scroll affordance (fade edge) so users know more tabs exist. Bigger reshape can come in a later wave. |
| Care Guide accordion? | **Defer** — bigger change touching the shared ManualPlantCreation component. Worth doing but not this wave. |
| Recurrence "next 3 dates" preview? | **Yes** — live, beside the frequency input. Cheapest win. |
| Empty state for BlueprintManager? | **Yes** — swap to shared `<EmptyState>` + harmonise copy ("No Task Schedules yet" not "No automations yet"). |
| Sticky save bar on Plant Edit Modal mobile? | **Defer** — separate consideration (modal layout, not field UX). |
| Bulk-pause schedules for winter? | **Defer** — bigger feature; per-schedule pause already exists. |

## App-reference files consulted

- [`docs/app-reference/04-planner/03-blueprint-manager.md`](docs/app-reference/04-planner/03-blueprint-manager.md)
- [`docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md`](docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md)
- [`docs/app-reference/08-modals-and-overlays/04-add-task-modal.md`](docs/app-reference/08-modals-and-overlays/04-add-task-modal.md)

---

## Changes

### 1. AddTaskModal — Next 3 dates preview

Below the "Repeat Every (Days)" input, show a small live-updating preview:

```
Next 3 occurrences: Mon 15 Jun, Fri 19 Jun, Tue 23 Jun
```

Pure computation from `start_date + frequency_days * N`. No DB call. Lifts the recurrence picker from abstract numbers to a concrete schedule the user can sanity-check.

### 2. BlueprintManager empty state

Replace the inline empty-state div with `<EmptyState size="lg" chrome="card">` from Wave 2. Copy harmonised:
- Title: "No Task Schedules yet" (was "No automations yet")
- Body: "Create custom schedules or use the AI Planner to generate them automatically."
- Primary CTA: "Create your first schedule" (was "Create Your First Automation")

### 3. Plant Edit Modal — tab scroll affordance

Add a right-edge fade gradient overlay on the horizontal tab strip when there are off-screen tabs. Visual cue that more tabs scroll into view. Pure CSS — no JS needed; the fade is always present, sized so it's only visible when there's overflow.

### 4. Plant Edit Modal — at-a-glance loading skeleton

The "at-a-glance" stats row at the top of the modal currently has no loading state — it just snaps in. Replace with `<SurfaceLoader shape="spinner" label="Loading…">` until the data lands.

### 5. AddTaskModal — frequency description (small polish)

The "Repeat Every (Days)" input already has a tip line. Wrap it in an `<InfoTooltip>` style instead so it's persona-aware (newcomers see the tip; experts see a dimmed `?` to tap if needed).

---

## Files

| File | Change |
|---|---|
| `src/components/AddTaskModal.tsx` | Add "Next 3 occurrences" preview + persona-aware frequency tip via InfoTooltip. |
| `src/components/BlueprintManager.tsx` | Use shared `<EmptyState>`; harmonise copy. |
| `src/components/PlantEditModal.tsx` | Add right-edge fade affordance to tab strip; use `<SurfaceLoader>` for at-a-glance loading. |
| `src/lib/scheduleDatePreview.ts` | NEW — pure helper `getNextOccurrences(startDate, freqDays, count)` for the preview. |
| `tests/unit/lib/scheduleDatePreview.test.ts` | NEW — unit test for the helper. |

---

## Risks & edge cases

- **Preview when no start_date set**: hide the preview line entirely.
- **Negative or zero frequency**: clamp to 1 day so the preview always advances forward.
- **End date set + preview overshoots**: cap the preview at end_date; show ellipsis if window is shorter than 3 occurrences.
- **Fade affordance on desktop**: tab strip doesn't usually overflow on desktop, so the fade should be subtle / nearly invisible there.

---

## Steps

1. `getNextOccurrences` helper + unit test.
2. Wire preview into AddTaskModal.
3. BlueprintManager empty-state swap.
4. PlantEditModal tab-strip fade + at-a-glance loader.
5. Typecheck + tests + deploy.
