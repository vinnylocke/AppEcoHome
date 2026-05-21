# Plan — Unassigned instances + per-plant Instances tab

## Goal

Two small, related changes to how plant instances work in The Shed:

1. **Allow planting without an area.** Today the Plant Assignment Modal forces the user to pick an area before they can create an instance. Sometimes (e.g., a plant they've just bought and not placed yet, or a new propagation that's still in a pot on the bench) the user knows they own the plant but hasn't decided where it goes. Add an **Add to garden** secondary action that creates an `inventory_items` row with `area_id = NULL`. The plant is "in the garden, area unknown".

2. **A per-plant Instances tab.** The Plant Edit Modal currently has 6 tabs (Care Guide, Automations, Light, Grow Guide, Community, Companions) but no "who lives where" view. Add an **Instances** tab listing every `inventory_items` row for that species in this home — area-assigned or unassigned alike — with each row clickable into the existing `InstanceEditModal`.

## App-reference docs consulted

- [docs/app-reference/08-modals-and-overlays/07-plant-assignment-modal.md](../app-reference/08-modals-and-overlays/07-plant-assignment-modal.md) — host of the new "Add to garden" button.
- [docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — host of the new Instances tab.
- [docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — reused unchanged when the user taps an instance row.
- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — planted-count chip and assignment launcher.
- [docs/app-reference/03-garden-hub/04-area-details.md](../app-reference/03-garden-hub/04-area-details.md) — existing surface that displays instances per area; we mirror its row pattern.
- [docs/app-reference/99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `inventory_items` schema.

## Data model

**No migration required.** The `inventory_items` schema already supports nullable area assignment:

- `area_id text` — not constrained NOT NULL.
- `area_name text` — likewise nullable.
- `location_id text` / `location_name text` — likewise nullable.
- `status text` — check constraint allows `'Unplanted' | 'Planted' | 'Archived'`.

For an unassigned-but-planted instance we write:
- `status = 'Planted'`
- `area_id = NULL`, `area_name = NULL`
- `location_id = NULL`, `location_name = NULL`
- `planted_at = today` (or user-picked date)

For an unassigned-and-unplanted instance (rarer — basically "I have a propagation cutting that hasn't gone in yet"):
- `status = 'Unplanted'`
- `area_id = NULL` etc.
- `planted_at = NULL`

The existing `unique_blueprint_date` and other constraints don't touch area_id, so this is purely an additive UI capability.

## Flow 1 — "Add to garden" button on Plant Assignment Modal

### Current flow

1. User taps Assign on a plant in The Shed.
2. Modal opens at Step 1 — pick a location, then pick an area.
3. Step 2 — set quantity, is-planted toggle, planted date, growth state, propagation source.
4. Tap Assign → creates `inventory_items` rows with area + location filled in.

### New flow

A new secondary CTA **"Add to garden"** sits next to the location/area picker on Step 1, with copy along the lines of:

> *Not sure where it'll go yet? Add it to your garden anyway — you can assign it to an area later.*

Tapping it:
- Skips Step 1's location picker entirely.
- Jumps to a slim Step 2 with only the relevant fields: quantity, is-planted toggle, planted date (when planted), growth state (when planted). The propagation source stays.
- The smart-schedule AI block stays available — schedules can attach to home-wide blueprints (no area_id needed; the existing flow already lets `inventory_item_ids` array carry instance refs).
- Tap **Add to garden** → calls `onAssign` with `{ ...formData, areaId: null, status: ... }`.

### Plant Assignment Modal contract

The modal's `onAssign` callback already receives the formData; we extend it so `areaId === ""` or `areaId === null` means "no area". TheShed's `handleAssign` becomes:

```ts
const handleAssign = async (assignmentData: any) => {
  const noArea = !assignmentData.areaId;
  let areaContext = { location_id: null, location_name: null, area_id: null, area_name: null };
  if (!noArea) {
    const { data: areaData } = await supabase
      .from("areas")
      .select("name, location_id, locations(name)")
      .eq("id", assignmentData.areaId)
      .single();
    areaContext = {
      area_id: assignmentData.areaId,
      area_name: areaData.name,
      location_id: areaData.location_id,
      location_name: areaData.locations?.name ?? "Unknown Location",
    };
  }
  // Insert N rows with areaContext spread in. status = Planted | Unplanted as before.
};
```

The `AutomationEngine.applyPlantedAutomations` call already takes `areaId` as a string — pass `null` for unassigned instances; the automation engine will need to tolerate that (or we skip the call for unassigned planted instances, which is a sensible default since most automations are area-anchored).

### UI placement

- Step 1 keeps the existing location → area picker.
- A divider with **OR** between the area picker and the new wide tile.
- The new tile says *"Add to your garden, area unknown"* with an explainer and a forward chevron.

## Flow 2 — Instances tab on Plant Edit Modal

### Current tabs

`care · schedules · light · grow_guide · guides · companions`

### New tabs

`care · schedules · light · grow_guide · guides · companions · **instances**`

(New tab at the end of the row so existing test selectors and muscle memory aren't disturbed.)

### What the Instances tab shows

A list of cards, one per active `inventory_items` row for this plant's species in this home:

- Identifier (or fallback to *"Instance #N"* if `identifier` is missing).
- Status pill: **Planted** / **Unplanted** / **Archived** (archived rows are typically hidden by default; toggle adds them back).
- Area pill: *"Back bed · Side garden"* — OR — *"Just in garden"* (a subtle dimmer pill) for unassigned.
- Planted date (when present).
- Growth state badge.
- Number of overdue tasks for this instance (chip), if any.

Tap a card → opens `InstanceEditModal` (passed in `instance` + `homeId`; `currentAreaId` defaults to empty string for unassigned).

A small **+ Add another to garden** button at the top of the tab creates a new unassigned `inventory_items` row in one tap (no modal). Useful for "I just acquired 3 more of this plant — set up the instances quickly".

### Read query

```ts
supabase
  .from("inventory_items")
  .select("id, plant_name, nickname, status, area_id, area_name, location_id, location_name, planted_at, growth_state, identifier, is_established, environment")
  .eq("home_id", homeId)
  .eq("plant_id", String(plant.id))
  .neq("status", "Archived")
  .order("planted_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false });
```

Realtime: piggyback on the existing `inventory_items` channel that TheShed already subscribes to — re-runs the query when a relevant row changes.

## Files to add

| File | Purpose |
|---|---|
| `src/components/plant/PlantInstancesTab.tsx` | New tab for Plant Edit Modal — queries inventory_items + renders rows + opens InstanceEditModal. |

## Files to modify

| File | Change |
|---|---|
| `src/components/PlantEditModal.tsx` | Add `instances` to the `tabs` array + render branch that mounts `<PlantInstancesTab>`. Pass `plant`, `homeId`, `aiEnabled`, `isPremium` through. |
| `src/components/PlantAssignmentModal.tsx` | Add the **Add to garden** secondary CTA on Step 1, alongside the existing area picker. New `handleSubmitNoArea` path that calls `onAssign` with `areaId: null`. |
| `src/components/InstanceEditModal.tsx` | Drop the area-required validation. Save handler null-outs both location + area when either is empty. Trigger automation engine when transitioning from unassigned-but-planted → fully placed. |
| `src/components/TheShed.tsx` | Update `handleAssign` to handle `areaId === null` (skip the area lookup; null-out the area columns in the insert). Guard `AutomationEngine.applyPlantedAutomations` when no area is set. |
| `src/lib/automationEngine.ts` | If `areaId` is falsy in `applyPlantedAutomations`, short-circuit gracefully (return early; nothing to apply). |
| `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` | Document the new tab. |
| `docs/app-reference/08-modals-and-overlays/07-plant-assignment-modal.md` | Document the new flow. |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | Mention that planted-count chip includes unassigned instances. |

## Tests

- `tests/unit/components/PlantInstancesTab.test.ts` — render with mixed assigned + unassigned + archived instances, assert correct labels and click → instance handler fires.
- `tests/e2e/specs/plant-assignment.spec.ts` (existing) — add a case: open assignment → tap "Add to garden" → verify the new inventory item has `area_id IS NULL`.

## Edge cases / risks

- **Smart schedules for unassigned planted instances.** Today smart schedules are area-anchored (location_id + area_id on the blueprint). For unassigned instances we either:
  - Skip the smart-schedule UI on the no-area path (simplest; matches the user's mental model — "you can set up schedules when you place it").
  - OR attach blueprints with `inventory_item_ids` set but `location_id` / `area_id` NULL. Doable but spreads the null-area handling further.
  - **Recommend skip for v1.** Show a small hint: *"Schedule reminders once you place this plant in an area."*

- **Bulk-add intent.** Users adding multiple unassigned instances (e.g., "I propagated 5 cuttings") might want the same identifier-suffix pattern the area-assignment path uses (`#0042`). The existing `identifier` generator works the same — keep it.

- **Visualiser / Garden Layout impact.** Unassigned instances don't appear on the Garden Layout (no area → no shape). Layout queries already filter by `area_id`, so this should be a no-op. Verify on the layout editor.

- **Realtime ordering.** Ordering by `planted_at DESC NULLS LAST` puts planted-with-date first, then unassigned with no date. Stable for typical usage.

- **Counts elsewhere.** The Shed's planted-count chip on each plant card counts all inventory_items rows for the plant. Unassigned instances are still inventory_items, so they count. That matches the user's expectation ("I have 3 of these").

## Tier gating

No tier-specific behaviour. Open to every tier.

## Edit-later support (folded in by user feedback)

The Instance Edit Modal's Details tab today **requires** location + area before save. To support assigning an unassigned instance later, the modal becomes:

- Both location and area are now **optional** on save.
- If both are empty → write `location_id: null, location_name: null, area_id: null, area_name: null`. Status can stay `Planted` (it's "in the garden, area unknown").
- If both are set → write all four (current behaviour).
- If one is set but the other isn't → treat as "still unassigned", null-out both. (Prevents bad intermediate state like "location with no area" that the rest of the app doesn't expect.)
- The current red-border + disabled-Save validation on the area picker is removed; replaced with a small **"Just in garden — pick a location and area to place it"** hint when both are empty.

On save:
- If the instance was unassigned and just got an area, `AutomationEngine.applyPlantedAutomations` fires for the now-assigned item (same logic that runs on the "Unplanted → Planted" transition). Smart schedules can attach.
- If the instance was assigned and got cleared back to unassigned, treat it like a status downgrade: leave existing blueprints alone (the user might re-assign tomorrow) but no new schedules fire.

## Out of scope (v1)

- **Bulk-assign a stack of unassigned instances to one area.** Power feature; defer.

- **Drag-and-drop from Instances tab onto Garden Layout.** Visualiser hook; out of scope.

- **"Just in garden" filter chip on The Shed**. Smart filter already supports `unassigned` (plants with zero instances) — extending it to "has unassigned instances" is a sensible follow-up but not v1.

## Sequencing

1. `automationEngine.ts` — guard the no-area branch (safe pre-condition).
2. `TheShed.tsx` `handleAssign` — accept `areaId: null`.
3. `PlantAssignmentModal.tsx` — add the **Add to garden** path.
4. `PlantInstancesTab.tsx` + register on `PlantEditModal.tsx`.
5. Unit + E2E tests.
6. Doc updates.
7. Release notes + deploy.
