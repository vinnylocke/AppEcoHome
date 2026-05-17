# Plan — Task Optimiser

## Overview

A new **"Optimise"** tab inside `BlueprintManager` that lets the home owner select an area, run an analysis of all task blueprints and instances in that area, review a before/after preview of proposed fixes, and apply them in one action. Old blueprints are archived (never deleted) so every change is reversible.

---

## Scope: Which Task Categories Are Optimised

| Category | Consolidate? | Reason |
|----------|-------------|--------|
| Watering | ✅ | Pure scheduling — no per-blueprint content to lose |
| Harvesting | ✅ | Timing-based, area-level harvesting is valid |
| Pruning | ✅ | Timing-based; plant instance links are preserved via junction table |
| Maintenance | ❌ | Contains specific notes/instructions per blueprint that cannot be safely merged |
| Planting | ❌ | One-time or seasonal; not meaningful to consolidate |

---

## Detection Scenarios

The analyser runs entirely client-side (all blueprint data is already loaded). It receives all `task_blueprints` where `area_id` matches the selected area, plus all blueprints that have any `inventory_item_id` in `inventory_item_ids[]` whose plant instance lives in that area. It then groups by `task_type` and applies the following rules:

### Scenario A — Fragmentation
**Trigger:** ≥2 instance-level blueprints of the same category in the same area, with different `frequency_days` or different `start_date` offsets (causing them to fire on different days).

**Proposed fix:** Create one area-level blueprint at the most frequent interval. Link all covered plant instances via `blueprint_plant_instances`. Archive the individual instance blueprints.

**Display:** "5 Watering blueprints across 5 plants in Raised Bed 1, firing on different days → consolidate into 1 area blueprint every 2 days."

---

### Scenario B — Redundant Overlap
**Trigger:** An area-level blueprint already exists for a category, AND one or more instance-level blueprints exist for the same category in the same area.

**Proposed fix:** Archive the instance-level duplicates. Ensure all their plant instances are linked to the existing area blueprint via `blueprint_plant_instances` (so the record is maintained).

**Display:** "Raised Bed 1 already has an area-wide Watering blueprint. 2 plant-level Watering blueprints are redundant → archive them."

---

### Scenario C — Frequency Outlier (Two-Tier)
**Trigger:** The most-frequent and least-frequent blueprints for the same category in an area differ by more than 2× (e.g. majority every 2 days, one plant every 7 days).

**Proposed fix (two-tier):** Area blueprint at the majority frequency (covering the mainstream plants via `blueprint_plant_instances`), plus a retained or adjusted supplemental blueprint for the outlier plant(s) with a note in the description explaining the split. The outlier blueprints are NOT archived — they stay, but the mainstream ones are consolidated.

**Display:** "4 of 5 plants need watering every 2 days. Tomato needs every 7 days → create area blueprint for the 4 common plants, keep Tomato blueprint as-is."

---

### Scenario D — Same-Day Pile-Up
**Trigger:** ≥3 instance-level blueprints for the same category in the same area all currently fire on the same day (based on `start_date` offset mod `frequency_days`), but haven't been consolidated. Not automatically merged if frequencies differ significantly.

**Proposed fix:** If frequencies are compatible (same or multiples), merge into a single area-level blueprint. If frequencies are incompatible, flag as an informational warning only ("Consider reviewing manually").

---

## Plant Instance Linking on Consolidated Blueprints

This is the key design point. The existing `inventory_item_ids uuid[]` column on `task_blueprints` has a UI-level same-species assumption (the blueprint creation form only allows picking multiple instances of the same plant). The optimiser creates blueprints **programmatically**, bypassing this UI restriction.

For consolidated area-level blueprints, the optimiser will:
1. Set `area_id` to the target area
2. Leave `inventory_item_ids` as `[]` (area-level blueprint, no instance-specific assignment)
3. Insert a row into `blueprint_plant_instances` for **every** plant instance covered, regardless of species

This means the consolidated blueprint maintains a complete audit trail of which plants it covers, displayed in the blueprint detail view as a list of linked plant instances. This is exactly what the `blueprint_plant_instances` junction table was built for.

The blueprint `description` field will also include a human-readable summary: _"Covers: Tomato (Bed A, pot 1), Basil (Bed A, pot 2), Courgette (Bed A, ground)"_ — so even without querying the junction table the intent is readable.

---

## Rollback / Sessions

A new `optimisation_sessions` table tracks every apply action:

```sql
CREATE TABLE optimisation_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  area_id               uuid REFERENCES areas(id) ON DELETE SET NULL,
  applied_by            uuid NOT NULL REFERENCES auth.users(id),
  applied_at            timestamptz DEFAULT now(),
  archived_blueprint_ids uuid[] NOT NULL DEFAULT '{}',
  created_blueprint_ids  uuid[] NOT NULL DEFAULT '{}',
  is_reversed           boolean DEFAULT false,
  reversed_at           timestamptz
);
```

**Apply:** Archive old blueprints (set `is_archived = true`, NOT delete), create new consolidated blueprints, write a session row.

**Undo:** For a given session — un-archive the `archived_blueprint_ids`, delete the `created_blueprint_ids`, set `is_reversed = true`. Only available if none of the created blueprints have been manually edited since (checked by `updated_at`).

**Session history** shown at the bottom of the Optimise tab — "2 changes, applied 3 days ago · Undo" — limited to 90 days.

Note: `task_blueprints` needs an `is_archived` boolean column if not already present. Archived blueprints are excluded from the task engine and the blueprint list view.

---

## UI Structure

### New Tab in BlueprintManager
Tab bar gains a third tab: `optimise` alongside `blueprints` and (if present) any others.

### `OptimiseTab.tsx`
- Area selector (dropdown scoped to the current home's areas, with location context shown)
- "Analyse" button → runs the client-side detection
- Results list: each detected issue shown as a card (scenario type badge, description, before/after summary)
- Each card has a toggle to include/exclude it from the apply batch
- "Apply X changes" primary button → shows a confirmation modal then executes
- Session history section at the bottom

### `OptimisationProposalCard.tsx`
- Shows scenario type badge (Fragmentation / Redundant / Two-Tier / Pile-up)
- "Before" column: list of blueprints that will be archived (title, frequency, assigned plants)
- "After" column: new blueprint(s) that will be created (title, frequency, plant instances linked)
- Include/exclude checkbox

### `OptimisationHistory.tsx`
- List of past sessions for this home, most recent first
- Per session: area name, date, number of blueprints archived / created, Undo button
- Undo disabled if session is older than 90 days or blueprints were manually edited after

---

## Data Model Changes

| Change | Migration needed? |
|--------|------------------|
| `optimisation_sessions` table | ✅ New migration |
| `task_blueprints.is_archived` boolean (default false) | ✅ New migration (if not present) |
| `blueprint_plant_instances` junction table | ❌ Already exists |
| RLS on `optimisation_sessions` | ✅ In same migration |

The task engine (`TaskEngine.fetchTasksWithGhosts()`) must filter out `is_archived = true` blueprints — needs a one-line addition to the existing Supabase query.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_task_optimiser.sql` | New — `optimisation_sessions`, `is_archived` column |
| `src/components/OptimiseTab.tsx` | New — main tab component |
| `src/components/OptimisationProposalCard.tsx` | New — per-scenario card |
| `src/components/OptimisationHistory.tsx` | New — session history + undo |
| `src/lib/taskOptimiser.ts` | New — pure analysis logic (no React, fully testable) |
| `src/components/BlueprintManager.tsx` | Modify — add Optimise tab to tab bar |
| `supabase/functions/_shared/taskEngine` (or equivalent) | Modify — filter `is_archived = true` |

---

## Out of Scope (This Phase)

- AI-assisted analysis — rule-based engine only for now; Gemini escalation deferred
- Push notifications when optimisations are suggested
- Optimising across multiple areas in one action
- Optimising location-level blueprints (only area-level in phase 1)
- Maintenance task merging (explicitly excluded)
