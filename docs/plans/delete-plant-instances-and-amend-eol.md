# Plan — Delete-plant instance choice + amend End-of-Life

Two related changes around plant instances (`inventory_items`) and the End-of-Life (EOL) state.

## App-reference files consulted
- `docs/app-reference/03-garden-hub/01-the-shed.md` — the Plants grid + delete flow
- `docs/app-reference/03-garden-hub/12-senescence.md` — the ended-instances destination
- `docs/app-reference/08-modals-and-overlays/37-lifecycle-complete.md` — the EOL flow
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — plants ↔ inventory_items

## Background (how it works today)
- A plant tile's **Delete** opens `ConfirmModal` (in `TheShed.tsx`); `executeDelete` deletes the `plants` row. `inventory_items.plant_id` is **ON DELETE CASCADE** (`fk_plants`), so every instance (and its tasks/journals) is wiped. The confirm only warns "this will also remove N inventory items".
- **EOL** lives on `inventory_items`: `ended_at`, `was_natural_end` (the "natural life" checkbox), `end_summary`, plus `status="Archived"`. Set by `LifecycleCompleteModal` (per-instance, from `InstanceEditModal`). Ended instances appear in the **Senescence** tab, which can **Restore** (un-end) or **Open** (→ `InstanceEditModal`).
- On an ended instance, `InstanceEditModal` shows a **static** "Lifecycle complete" card — no way to amend `was_natural_end` / `end_summary` without restoring and re-ending.

---

## Feature 1 — Delete a plant that has instances: delete them, or keep them as End of Life

**Why:** deleting a plant silently cascade-deletes its garden instances + their history. The user wants the choice to preserve that history.

**Design (safe — avoids the cascade trap):** because the FK cascades, we can't keep instances *and* delete the plant without orphaning them (risky — RLS/queries assume `plant_id`). So:

When the plant has **any** instances (`inventoryCount > 0`), the delete dialog presents two actions (plus Cancel):
- **Keep the history (End of Life)** *(recommended/safe)* — mark every still-active instance End of Life (`ended_at = now`, `was_natural_end = null` (unknown — amendable later, see Feature 2), `end_summary = "Retired from your Plants on <date>"`, `status = "Archived"`), journal a closing entry per instance, and **archive the plant species** (`is_archived = true`) instead of deleting. Nothing is lost; the plant + its instances stay restorable (Senescence restore + Plants "Archived" tab). No AI analysis is auto-run (bulk action).
- **Delete everything** *(destructive)* — the current behaviour: delete the plant (cascades instances/tasks/journals) + clean up `task_blueprints`.

When the plant has **no** instances → unchanged simple "Permanently delete?" confirm.

**Implementation:**
- `TheShed.tsx`: extend `confirmState` with the instance count (already fetched as `inventoryCount`) and render a richer delete modal when `inventoryCount > 0` (two distinct action buttons). Add `executeEndOfLifeInstead(plant)`:
  - `update inventory_items set ended_at, was_natural_end=null, end_summary, status='Archived' where plant_id = … and ended_at is null`
  - insert closing `plant_journals` rows for those instances (best-effort)
  - `update plants set is_archived = true where id = …`
  - toast + `refreshShed()`.
- Keep `executeDelete` as-is for "Delete everything".
- Likely a small dedicated block rather than overloading the generic `ConfirmModal` (it only takes one confirm action). Reuse `ConfirmModal` for the no-instances case.

## Feature 2 — Amend an instance's End-of-Life

**Why:** if a plant was marked "natural" but later found otherwise (or vice-versa), or the note needs fixing, the user should edit it without a restore→re-end round trip.

**Design:** make `LifecycleCompleteModal` support an **amend mode** (`mode?: "create" | "amend"` + `initial?: { wasNaturalEnd, endSummary }`):
- Pre-fills the checkbox + note from the instance.
- Title "Amend lifecycle"; button "Save changes".
- On save: `update inventory_items set was_natural_end, end_summary where id = …` (does **not** touch `ended_at`/`status`). Journal a small "Lifecycle details updated" entry.
- If the value changes **natural → not-natural** and AI is enabled, offer/run `analyse-plant-end-of-life` (same path as create) so a late correction still gets insights. (natural ← not-natural just clears the "Other" framing; no new analysis.)

**Surface:** in `InstanceEditModal`, swap the static "Lifecycle complete" card for one with an **"Amend"** button (testid `instance-amend-lifecycle`) opening the modal in amend mode. This covers both the Plants grid (open a plant's instance) and the Senescence tab (its "Open" already routes to `InstanceEditModal`). Optionally add a direct amend action on Senescence rows later.

---

## Files to change
- `src/components/TheShed.tsx` — delete dialog with the two-way choice + `executeEndOfLifeInstead`.
- `src/components/LifecycleCompleteModal.tsx` — `mode`/`initial` props; amend save path.
- `src/components/InstanceEditModal.tsx` — "Amend" affordance on the ended-instance card.
- (Maybe) `src/components/garden/SenescenceTab.tsx` — optional direct amend action.

## Tests
- Unit: none obvious (DB-mutation flows). Possibly a small helper test if logic is extracted.
- E2E (shed-crud): deleting a plant with instances shows the two-way choice; "Keep as End of Life" archives the plant + the instance appears in Senescence (resilient to seed state). Amend: open an ended instance → amend → value persists.
- Page objects: add the new delete-choice + amend testids.

## App-reference docs to update
- `01-the-shed.md` — the delete flow now offers "Keep as End of Life" vs "Delete everything".
- `37-lifecycle-complete.md` — the modal now also amends an existing EOL.
- `12-senescence.md` — note instances can be amended (natural ↔ other) via Open → Amend.

## Risks
- Bulk-end touches multiple `inventory_items` + journals — wrap defensively; archive the plant only after the instance update succeeds.
- "Delete" that archives (not deletes) when choosing EOL must be crystal-clear in the copy so it isn't surprising.
- Untestable here → verify on device.

## Open decisions for sign-off
1. **Feature 1 outcome of "Keep as End of Life":** archive the plant species (recommended — safe, restorable) vs. truly delete the plant but orphan the instances (risky). Plan assumes **archive**.
2. **Feature 2 amend re-analysis:** when natural → not-natural, auto-run AI analysis (Sage+) or just save the change? Plan assumes **offer/run analysis** to match the create flow.

## Deploy
Frontend-only (no migration — EOL columns already exist). One deploy, then push to `main`.
