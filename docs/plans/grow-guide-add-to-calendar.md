# Plan — Grow Guide "Add to Calendar"

## Goal

When the user is viewing the Grow Guide for a plant (in The Library OR in the Plant Edit Modal), each section should expose an **Add to calendar** affordance that turns the AI's scheduling guidance into real tasks + blueprints in the user's calendar — using the **same SuggestedTask shape and same `TaskActionButtons` UI** that the Plant Doctor / Visual Lens / Plant Doctor Chat already use.

Where the AI says *"prune in late spring"* or *"sow seeds in March or April"*, the system converts that **hemisphere-aware month window** into concrete `task_blueprints` (recurring) or `tasks` (one-off) rows with sensible start / end / due dates.

Confirm parity with the Plant Doctor flow at the same time: Visual Lens already has add-to-calendar via `<TaskActionButtons>`. The Grow Guide should mirror it exactly so the user's mental model is consistent.

---

## What the AI must give us

We extend the existing `GROW_GUIDE_SCHEMA` so every section (where applicable) can declare a `schedulable_tasks` array:

```ts
interface SchedulableTask {
  title: string;                          // "Prune Lavender to shape"
  description: string;                    // 1-2 sentences, action-oriented
  task_type:
    | "Watering" | "Pruning" | "Harvesting" | "Planting"
    | "Maintenance" | "Fertilizing" | "Inspection";
  is_recurring: boolean;
  /** Days between runs when recurring. null for one-off. */
  frequency_days: number | null;
  /**
   * Hemisphere-aware month set when the task is active.
   * 3-letter month abbreviations: "Jan" … "Dec".
   * Empty / null means "any time of year".
   * For recurring: blueprint runs only between the first and last
   * of these months.
   * For one-off: due_date = first day of the first month.
   */
  active_months: string[] | null;
  /**
   * For recurring tasks — total active span. Optional; when null we
   * derive from active_months.
   */
  duration_days: number | null;
  priority: "Low" | "Medium" | "High";
  /** Index into the same section's schedulable_tasks array; one-offs only. */
  depends_on_index: number | null;
}
```

The prompt is updated to instruct the model to:

- Calibrate `active_months` to the user's hemisphere (already threaded into the prompt — flip Mar–May for Southern).
- Only emit `schedulable_tasks` for sections that are genuinely actionable: **pruning, harvesting, propagation, germination, water, soil/feeding**. Sunlight / flowering / senescence usually leave it empty.
- For `water`: emit a recurring task with `frequency_days` matching the key_facts (e.g. 3 for "every 3 days in summer"), and `active_months` reflecting the growing season for that climate.
- For `propagation` / `germination`: usually one-off tasks tied to a specific month window.
- For `pruning`: one-off OR low-frequency recurring (e.g. every 28 days during the pruning window).
- For `harvesting`: recurring during the harvest window.

The display side of the grow guide is unchanged — `schedulable_tasks` is an *additional* field that doesn't affect the existing `key_facts / steps / tips / notes` rendering.

## What the client converts

`SchedulableTask` → `SuggestedTask` (the existing shape `TaskActionButtons` consumes):

```ts
{
  title, description, task_type,
  is_recurring,
  frequency_days,
  due_in_days,                // computed from active_months
  end_offset_days,            // computed from active_months
  depends_on_index,
}
```

A new helper `src/lib/scheduleFromSchedulableTask.ts` does the conversion. Pure function; trivial to unit-test. Inputs:

- The `SchedulableTask` payload from the AI.
- Today's local date (for "next occurrence").
- The home's hemisphere (already threaded everywhere).

Outputs: a `SuggestedTask` ready to feed into `TaskActionButtons`.

**The month-to-date rules:**

- `active_months: ["Mar", "Apr", "May"]` + today is January → `due_in_days` = days until March 1; `end_offset_days` = days from March 1 to May 31. (For Sage-aware UK users; the AI already produced these months relative to their hemisphere.)
- `active_months: ["Mar", "Apr", "May"]` + today is April → `due_in_days` = 0 (start now); `end_offset_days` = days until May 31.
- `active_months: ["Mar", "Apr", "May"]` + today is June → `due_in_days` = days until next March 1 (next year); `end_offset_days` = the same Mar–May next year.
- `active_months: null` → year-round; `due_in_days` = 0; `end_offset_days` defaults to `frequency_days * 12` for recurring, or 0 for one-off.

This lives in the lib helper so it's testable + reusable.

## User-facing flow

### From The Library (PlantPreview)

1. User is on Grow Guide tab of a Library plant. Each section card already has summary / key_facts / steps / tips.
2. **New**: when `schedulable_tasks.length > 0`, the section card has a small **Add to calendar** button at the bottom right of the card header.
3. Tap → opens a bottom-sheet (mobile) / inline panel (desktop) hosting `<TaskActionButtons tasks={converted} homeId={homeId} ... />`.
4. The user reviews / unchecks tasks → taps **Add tasks**. Existing TaskActionButtons writes to `tasks` + `task_blueprints` exactly as it does today.
5. **Library context caveat**: the Library plant might not be in the user's Shed yet. We do NOT block — blueprints in the existing flow already insert without `inventory_item_ids`, and the home-scoped task_blueprints row stands on its own. If the user later saves the plant, they can manually assign the existing blueprint to the new instance via the existing Blueprint Manager UI.

### From the Plant Edit Modal (Shed plant)

Same affordance per section. Tasks/blueprints land in the user's calendar attached to `home_id` (no `inventory_item_ids` — species-level template), matching the existing Plant Doctor pattern.

### From the Plant Doctor / Visual Lens

**No change needed** — `<TaskActionButtons>` is already there. The plan confirms parity rather than adds it.

## App-reference docs consulted

- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — host surface (Grow Guide tab).
- [docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md](../app-reference/08-modals-and-overlays/36-grow-guide-tab.md) — current schema + UI.
- [docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — Plant Edit Modal hosts the same tab.
- [docs/app-reference/04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md) — where blueprints live after creation.
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — task / blueprint schema.
- [docs/app-reference/05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — reference for the add-to-calendar pattern.
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini schema + prompt patterns.
- [docs/app-reference/99-cross-cutting/29-seasonality.md](../app-reference/99-cross-cutting/29-seasonality.md) — hemisphere logic.

## Files to add

| File | Purpose |
|---|---|
| `src/lib/scheduleFromSchedulableTask.ts` | Pure helper: `SchedulableTask` + hemisphere + today → `SuggestedTask`. Includes month → next-occurrence date math. |
| `tests/unit/lib/scheduleFromSchedulableTask.test.ts` | Unit tests for the four month-to-date scenarios above + edge cases (wrap around year-end, empty active_months, one-off vs recurring). |
| `src/components/growGuide/AddToCalendarSheet.tsx` | Bottom-sheet / inline panel that hosts `<TaskActionButtons>` for the converted tasks. Mobile-first; on desktop renders inline below the section card. |

## Files to modify

| File | Change |
|---|---|
| `supabase/functions/_shared/growGuide.ts` | Extend `GROW_GUIDE_SCHEMA` with `schedulable_tasks` per section. Update `buildGrowGuidePrompt` to instruct the model in detail (months, hemisphere, frequency, task_type vocabulary). Update `diffGrowGuide` to ignore cosmetic changes inside `schedulable_tasks` (sort by title for set-style comparison). |
| `supabase/functions/plant-doctor/index.ts` | `generate_grow_guide` action's response shape stays — schema change handles it. Bump `maxOutputTokens` if needed (already at 8192 from a previous fix). |
| `src/services/plantDoctorService.ts` | Add `SchedulableTask` interface + extend `GrowGuideSection`. |
| `src/components/growGuide/GuideSectionCard.tsx` | When `schedulable_tasks.length > 0`, render a small **Add to calendar** button next to the section's title. On tap, opens `<AddToCalendarSheet>`. |
| `src/components/GrowGuideTab.tsx` | Pass `homeId` through to the cards so `AddToCalendarSheet` can call `TaskActionButtons`. Currently homeId is already on this component. |
| `docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md` | Document the new affordance + the extended schema. |
| `docs/app-reference/02-dashboard/12-the-library.md` | Reference the affordance under "Every flow". |
| `supabase/tests/growGuide.test.ts` | Add a test case for the extended schema (no behaviour change in `diffGrowGuide` for sections with identical schedulable_tasks). |
| `tests/unit/components/GuideSectionCard.test.ts` | Render with `schedulable_tasks` + assert the Add-to-calendar button shows, otherwise hidden. |

## Backwards compatibility

- Existing cached `plant_grow_guides` rows have no `schedulable_tasks`. The UI tolerates absence — the Add-to-calendar button just doesn't render.
- Next time the refresh-stale-grow-guides cron runs (90-day cadence), guides will be regenerated with the new schema. Manual refresh from the tab also picks it up immediately.
- The schema version stays at 1 — `schedulable_tasks` is additive and optional, so old payloads remain valid.

## Edge cases / risks

- **Task type mapping** — the AI sometimes emits non-standard task types (e.g., "Sowing"). The lib helper validates against the allow-list and falls back to "Maintenance" with a Sentry warning so we can spot the drift.
- **`active_months` always populated for "year-round" tasks** — could be misleading (12 months ≠ "no seasonality"). Treat 12 months as "year-round" semantically: `due_in_days = 0`, `end_offset_days = frequency_days * 12`.
- **Library plant without home-scoped instance** — blueprint binds to `home_id` only (no `inventory_item_ids`). Future assignment via Blueprint Manager. The user is informed via a small note on the sheet: *"This will live in your calendar even without a specific plant assigned. You can attach it to plants in your Shed later from the Blueprint Manager."*
- **Multiple categories share watering needs** — water section's recurring task vs a pruning section's seasonal one-offs. No duplicate detection in v1; user can uncheck.
- **Hemisphere ambiguity** — if the home has no `home_climate.country/lat` set, the prompt defaults to Northern. The lib helper accepts an explicit hemisphere param and never assumes from device tz.
- **End-of-year wrap** — if today is December and `active_months = ["Mar", "Apr", "May"]`, the start_date is March 1 of next year. The unit tests cover this.

## Tier gating

| Tier | Behaviour |
|---|---|
| Sprout / Botanist | Grow Guide tab itself is gated (AI required). The Add-to-calendar button is moot. |
| Sage / Evergreen | Full feature. |

## Out of scope (v1)

- **Companion-plant follow-on tasks** (e.g., "harvest beans, then sow lettuce in the same bed") — Plans surface handles cross-plant sequencing.
- **Per-instance assignment from the sheet** — v1 attaches blueprints to the home, not specific instances. Marcus can refine via Blueprint Manager. v2 could add an instance picker on the sheet.
- **Skip-if-already-scheduled detection** — if the user has a similar watering blueprint already, we don't auto-skip in v1.
- **Bulk "add all schedulable" button** at the top of the Grow Guide tab — per-category control only for v1.
- **Re-running the AI to flesh out an existing guide that lacks schedulable_tasks** — manual refresh from the tab is enough.

## Sequencing

1. Extend `GROW_GUIDE_SCHEMA` + prompt builder + `diffGrowGuide` (shared module).
2. `scheduleFromSchedulableTask.ts` lib + unit tests.
3. `AddToCalendarSheet` component (mobile bottom-sheet, desktop inline panel).
4. Wire button into `GuideSectionCard` (gated on `schedulable_tasks.length > 0`).
5. Update services type definitions.
6. Component tests for the card.
7. App-reference doc updates.
8. Release notes + deploy.

## Use cases

### Sarah — small back garden, one tomato plant

Sarah opens the Library, looks up Tomato 'Roma', taps the Grow Guide tab. The Watering section now has a small **Add to calendar** chip. She taps it. A bottom sheet rises:

- ☑ *Water Roma every 3 days during the growing season* — Watering, recurring 3d, Apr 1 → Sep 30, **Medium**
- ☑ *Deep-water during heatwaves* — Watering, recurring 7d, Jul 1 → Aug 31, **Medium**

She taps **Add tasks**. Both blueprints land in her calendar. The next morning her Today screen shows the first watering task ready.

She scrolls to the Pruning section, hits Add to calendar:

- ☑ *Pinch out side shoots weekly* — Pruning, recurring 7d, May 1 → Sep 30, **Medium**

Adds. Done. Three blueprints set up in under a minute.

### Marcus — multi-bed grower, twelve tomato varieties

Marcus uses the same flow but more deliberately. He opens his existing Tomato 'Sungold' from the Shed, goes to Grow Guide → Pruning. Two tasks proposed:

- ☑ *Pinch side shoots (cordon types) weekly* — Pruning, recurring 7d, May 1 → Sep 30
- ☑ *Top out the plants in late summer* — Pruning, one-off, Aug 15

He **unchecks** the first because he already has a custom weekly pinch-out blueprint covering it. Saves just the late-summer top-out as a one-off task. The depends_on_index pointer threads through if the AI suggested an ordered set (e.g., "top out THEN harvest").

He then walks to the Harvesting section, sees a recurring "check for ripe fruit every 2 days from Jul 15 to Oct 1" task. Adds it.

Goes about his day; his calendar now mirrors his Sungold's seasonal expectations without a single manual blueprint edit.
