# Plan — Phase 2 Wave 2 Pass 2: Photo Surfaces (Tasks + Ailments + Timeline union)

## Context

Pass 1 ([phase2-wave2-photos-everywhere.md](./phase2-wave2-photos-everywhere.md)) shipped the unified `PhotoUploader` and the chronological Photo Timeline tab. Pass 2 wires photos into two more surfaces that need new DB columns, then unions those sources into the timeline.

Plan reference photos (third Pass 1-deferred surface) are pushed to a Pass 3 because they need a new table + integration into the plan staging UI — bigger than a single pass.

## Scope

### 1. Migration — `20260519000000_photo_surfaces.sql`
- `ALTER TABLE tasks ADD COLUMN completion_photo_url text;`
- `ALTER TABLE plant_instance_ailments ADD COLUMN photo_url text;`
- `ALTER TABLE plant_instance_ailments ADD COLUMN notes text;` (small bonus — users want to record context when linking an ailment)
- No RLS changes — these columns inherit existing table RLS.

### 2. Task completion photo in TaskModal
- Below the task-status row, when `task.status === "Completed"`, render a `PhotoUploader` bound to `task.completion_photo_url`.
- Saves immediately (debounced) via `tasks` update; no separate save button.
- Adds an explanatory caption: *"Optional — photograph the result if it's useful for future reference."*

### 3. Ailment photo in LinkAilmentModal
- Add a `PhotoUploader` to the modal between the ailment picker and the action buttons.
- Add an optional `notes` textarea ("Anything to flag about how this plant is affected? — optional").
- Both `photo_url` and `notes` are inserted into `plant_instance_ailments` along with the existing fields.

### 4. PhotoTimelineTab — union task completion + ailment photos
- Expand the source query so that for a given `inventory_item_id`, we union:
  - `plant_journals.image_url` (already shipped Pass 1)
  - `tasks.completion_photo_url` where the task is linked to this `inventory_item_id` and `status = 'Completed'`
  - `plant_instance_ailments.photo_url` where `plant_instance_id = inventory_item_id`
- Each photo carries its `source` ("journal" | "task" | "ailment") which renders a small chip badge in the corner.
- Ordering remains newest-first by event date.

## Out of scope (Pass 3 / later)

- Plan reference photos — needs `plan_photos` table + UI in plan staging
- Annotations canvas in Plant Doctor — needs `photo_annotations` table + canvas component
- AI "best photo" selector — needs edge function

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/20260519000000_photo_surfaces.sql` | New — adds the two columns + bonus notes column |
| `src/components/TaskModal.tsx` | New PhotoUploader for completion_photo_url |
| `src/components/LinkAilmentModal.tsx` | PhotoUploader + notes textarea |
| `src/components/PhotoTimelineTab.tsx` | Union task + ailment sources |

## Process

1. Apply migration locally — `supabase migration up`
2. Wire UI surfaces
3. `npx tsc --noEmit` clean
4. Hand back for user review before pushing migration to remote
