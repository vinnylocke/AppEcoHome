# Plan — Phase 2 Wave 2: Photos Everywhere (Scoped Pass 1)

## Background

The Phase 2 plan defines Wave 2 as a multi-surface photo overhaul ([whole-app-overhaul-phase2.md § Wave 2](./whole-app-overhaul-phase2.md#wave-2--photos-everywhere-2-days)). To keep this wave landable in one deploy without migrations, I'm splitting it into two passes:

| Pass | Includes | Needs migration? |
|------|----------|-----------------|
| **Pass 1 (this wave)** | PhotoUploader component, PlantJournalTab refactor, Photo Timeline tab | No |
| Pass 2 (follow-up) | Task completion photo, Ailment photo, Plan reference photo, Annotations, AI best-photo | Yes — `tasks.completion_photo_url`, `plant_instance_ailments.photo_url`, `plan_photos` table, `photo_annotations` table |

## Pass 1 scope

### 1. Unified `PhotoUploader` component
- **File**: `src/components/PhotoUploader.tsx` (new)
- Props: `bucket`, `pathPrefix`, `existingUrl?`, `onChange(url | null)`, `aspectClass?`, `label?`
- Handles: file input, drag-and-drop, paste-from-clipboard, optimistic preview, Supabase Storage upload, progress bar, remove-photo
- Returns the resulting public URL via `onChange`
- Designed to be drop-in for existing single-photo inputs

### 2. Refactor `PlantJournalTab`
- Replace the inline upload/progress code (lines ~170–205 of `src/components/PlantJournalTab.tsx`) with `<PhotoUploader bucket="plant-images" pathPrefix="plant-photos" ... />`
- Net effect: no UX change for users; codebase has one canonical uploader.

### 3. Photo Timeline tab on InstanceEditModal
- **File**: `src/components/PhotoTimelineTab.tsx` (new)
- Added as a new tab in `InstanceEditModal.tsx` (and optionally `PlantEditModal.tsx`)
- Query: `plant_journals` rows for this `inventory_item_id` where `image_url IS NOT NULL`, ordered by `entry_date DESC`.
- Layout: responsive grid of square photos; each shows date + subject snippet on hover/tap.
- Tap a photo → opens fullscreen viewer (reuse existing image viewer if available, otherwise a simple lightbox).

## Out of scope (Pass 2)

These require schema changes and so will land in a follow-up deploy:
- Task completion photo (needs `tasks.completion_photo_url` migration + completion flow UI change)
- Ailment photo in LinkAilmentModal / AilmentWatchlist add (needs `plant_instance_ailments.photo_url` migration)
- Plan reference photos (needs `plan_photos` table)
- Annotations canvas in Plant Doctor (needs `photo_annotations` table)
- AI "best photo" suggestion (needs new edge function `pick-best-photo`)

## Files touched (Pass 1)

| File | Change |
|------|--------|
| `src/components/PhotoUploader.tsx` | New — unified uploader |
| `src/components/PlantJournalTab.tsx` | Refactor to use PhotoUploader |
| `src/components/PhotoTimelineTab.tsx` | New — chronological photo grid |
| `src/components/InstanceEditModal.tsx` | Add "Photos" tab |

## Verification

- `npx tsc --noEmit` clean.
- Manual: open Plant Edit / InstanceEditModal → Journal tab → upload a photo (verify still works). Then open Photos tab → see uploaded photo in timeline.
- Backwards-compat: existing `plant_journals` rows must continue to render in both Journal tab AND new Photos tab.
