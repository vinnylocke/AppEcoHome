# Seasonal Picks — one-tap "Add planting tasks" from a tile

## Goal

On each **Sow & grow this week** tile (`SeasonalPickTile`), add a button that
adds this plant's **planting tasks** (the right sowing method + dates) straight
to the calendar, without the user having to open the tile → detail modal →
Grow Guide tab → Generate → "Add all". As a bonus, ensure the plant's grow
guide is generated/cached in the background so it's already there if the user
later opens the plant.

## App-reference files consulted

- `docs/app-reference/02-dashboard/14-seasonal-picks.md` — the card + tile contract
- `docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md` — the guide + its "Add all to calendar" flow
- `docs/app-reference/99-cross-cutting/29-seasonality.md` — hemisphere-aware month → date conversion
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — task/blueprint insertion contract

## What already exists (reused, not rebuilt)

- **The pick data** (`SeasonalPick`, `seasonalPicksService.ts`) already carries
  `sow_method` (direct/indoor/cutting/division/transplant), `sow_window_start/end`,
  `harvest_window`, and often `plant_library_id` / `plant_id`.
- **Catalogue-ensure** — `ensureCataloguePlantFromSearchResult(result, { homeId })`
  (via `useCataloguePlantFromResult`) resolves a pick's synthesized
  `ProviderSearchResult` into a real `plants` row (`plantId > 0`). Clones from
  `plant_library` when `plant_library_id` is present (fast, no Gemini); else
  generates. The tile already builds exactly this synthesized result in
  `openPreview()`.
- **Grow guide** — catalogue-level, one row per `plants.id` in
  `plant_grow_guides`; `PlantDoctorService.generateGrowGuide(plantId, homeId)`
  generates/caches it. Each `GrowGuideSection` (categories: water, soil,
  sunlight, **propagation**, **germination**, pruning, flowering,
  **harvesting**, senescence) carries `schedulable_tasks` with `task_type`
  incl. `Planting` / `Harvesting` and hemisphere-aware `active_months`.
- **The add-to-calendar primitive** — `AddToCalendarSheet` takes
  `{ plantId, plantName, schedulableTasks }`, converts via
  `scheduleFromSchedulableTasks` → `TaskActionButtons`, and already handles
  duplicate detection, the per-instance picker, and an **"Also add to your
  Shed"** toggle (perfect for a pick the user doesn't own yet).
  `flattenSectionsForCalendar` + `enrichDescriptionWithSteps` fold each
  section's how-to steps (the "methods") into the task description.

The whole feature is therefore mostly **wiring existing pieces**, plus one small
pure helper and a UI control.

## Recommended design (please confirm)

A small secondary button on each tile (calendar-plus icon, `data-testid=
"seasonal-pick-add-{index}"`), separate from the tile body so we don't nest
`<button>`s. Tapping it, in the parent `SeasonalPicksCard`:

1. **Ensure the catalogue plant** — `ensureCataloguePlantFromSearchResult` with
   the same synthesized result the tile already builds → `plantId`.
   (Usually a fast library clone; a brief spinner covers it.)
   - **"Create it + add to the library" is already handled by the platform.**
     When picks are generated, `seasonalPicksHandler` resolves each to a
     `plant_library` row and **fires `seed-plant-library` in the background for
     any pick that isn't in the library yet** (`fireBackgroundLibrarySeed`) — so
     novel picks become first-class library plants automatically, server-side,
     without the admin-only `add-plant-to-library` path. For the quick-add,
     `ensureCataloguePlantFromSearchResult` clones the library row when present
     (`plant_library_id`) and otherwise creates a reusable global AI catalogue
     `plants` row via `generateCareGuide` — enough for the guide + tasks — while
     that background library seed lands. No client-side library write is added
     (that path is deliberately admin-gated: bug-audit-2026-07-10 #13).
2. **Assemble the planting tasks** (`SchedulableTask[]`):
   - If a grow guide **already exists** for `plantId` → take the planting-journey
     tasks: the `schedulable_tasks` from the **propagation + germination +
     harvesting** sections, step-enriched. (This is the "right methods + dates",
     straight from the guide.)
   - If **no guide exists** → build **pick-derived** tasks instantly from the
     tile's own data: a `Planting` task ("{Direct sow|Indoor start|…} {plant}")
     dated to `sow_window_start` (or now if we're inside the window), plus a
     `Harvesting` task at `harvest_window.start` when present. Then **fire grow-
     guide generation in the background** (non-blocking) so the guide is cached
     for when the user opens the plant later.
3. **Open `AddToCalendarSheet`** pre-loaded with those tasks + `plantId` +
   `plantName`. The user gets the dedupe check, the "Also add to your Shed"
   toggle, and one confirming "Add" tap.

Why this shape:
- **Quick**: never blocks on a 10–15s guide generation — pick-derived tasks are
  instant, and a cached guide opens instantly too.
- **Right methods + dates**: uses the guide's planting schedule when available;
  falls back to the pick's own method + window.
- **Guide ready later**: background generation matches "generate the grow guide
  back end if there's not one already" exactly.
- **Safe**: reusing `AddToCalendarSheet` inherits duplicate-detection, offline
  queueing, instance linking, and add-to-Shed for free — no silent double-adds.

### Two choices to confirm

1. **Which tasks count as "planting"?** Recommended: the **propagation +
   germination + harvesting** journey (get it in the ground → to harvest),
   *not* ongoing care (watering/pruning/fertilizing — the user can still add
   those from the full guide). Alternative: add *all* the guide's schedulable
   tasks (same as the guide's "Add all").
2. **Confirm step vs. silent add?** Recommended: open `AddToCalendarSheet`
   (one extra "Add" tap, but preview + dedupe + add-to-Shed). Alternative: a
   true one-tap silent add with just a toast (faster, but no preview/dedupe and
   no instance/shed choice).

## Files to change

- `src/components/seasonal/SeasonalPickTile.tsx` — restructure the outer
  `<button>` into a container so the tile body stays a button
  (`seasonal-pick-{index}`, unchanged) and add a sibling
  `seasonal-pick-add-{index}` button; new `onQuickAdd(pick)` prop (tile stays
  presentational). Show a per-tile spinner while its add is preparing.
- `src/components/seasonal/SeasonalPicksCard.tsx` — own the quick-add flow:
  `preparingIndex` state, the ensure → assemble → open-sheet sequence, and
  render `AddToCalendarSheet`. Reuses the existing `homeId`/`aiEnabled` props.
- **New** `src/lib/seasonalPickPlantingTasks.ts` — pure helpers:
  `plantingTasksFromGuide(guide)` (filter to propagation/germination/harvesting,
  flatten + step-enrich) and `plantingTasksFromPick(pick, today)` (build the
  fallback `SchedulableTask[]` from `sow_method` + `sow_window` +
  `harvest_window`). Pure → unit-testable.
- `src/events/registry.ts` — add `SEASONAL_PICK_QUICK_ADD` event.
- `AddToCalendarSheet` — reused as-is (no change expected).

## Tests

- **Vitest** `tests/unit/lib/seasonalPickPlantingTasks.test.ts` —
  `plantingTasksFromGuide` picks only the three journey sections + step-enriches;
  `plantingTasksFromPick` maps each `sow_method` to the right verb/`Planting`
  type, dates from the window, and appends a `Harvesting` task iff a harvest
  window exists.
- **Playwright** — extend the seasonal-picks spec: with the plant-doctor edge
  fn mocked to return a pick, tap `seasonal-pick-add-0`, assert
  `add-to-calendar-sheet` opens pre-loaded and an add lands a task. (Mocking
  approach mirrors the existing seasonal-picks dashboard test.)

## App-reference updates

- `02-dashboard/14-seasonal-picks.md` — document the quick-add button + flow
  (both roles).
- `08-modals-and-overlays/36-grow-guide-tab.md` — cross-note that
  `AddToCalendarSheet` is now also opened from the seasonal picks tile, and the
  guide may be generated via that path.
- `docs/e2e-test-plan/30-home-main.md` (seasonal picks rows) + `TESTING.md`
  counts.

## Risks / edge cases

- **Nested buttons** — the tile is currently one big `<button>`; the add control
  must be a sibling, not nested. Handled by the restructure above; the existing
  `seasonal-pick-{index}` testid + tap-to-open-detail behaviour is preserved.
- **Ensure latency** — a pick without a `plant_library_id` may take longer to
  ensure (Gemini). Covered by the per-tile spinner; the sheet opens when ready.
- **Non-AI tiers** — the card is already `FeatureGate feature="ai_insights"`, so
  every viewer is AI-enabled; the guide-generation path is safe. Defensive
  fallback to pick-derived tasks if generation is unavailable.
- **Duplicates** — reusing `AddToCalendarSheet` means its duplicate detection
  pre-unchecks tasks that match existing blueprints, so re-tapping a pick won't
  silently double-add.
