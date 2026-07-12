# Data Model — Photos, Journals, Storage Buckets

> Rhozly stores user-generated media across many surfaces — instance photos, journal photos, plan reference photos, task completion photos, plant doctor images, area scans, visualiser captures, ailment photos, sprite assets, guide images. Each lives in its own Supabase Storage bucket with its own RLS policies.

---

## Quick Summary

```
Buckets (Supabase Storage)
├── instance-photos          ← PhotoTimelineTab
├── plant-images             ← PlantJournalTab + Quick Capture Journal (prefix: plant-photos)
├── plan-photos              ← PlanReferencePhotos
├── plan-covers              ← AI-generated plan hero
├── task-photos              ← Task completion photos
├── plant-doctor-images      ← Plant Doctor uploads
├── plant-doctor-results     ← Cached AI responses (transient)
├── ailment-photos           ← Link Ailment Modal
├── area-scans               ← Area Scan Modal
├── garden-sketches          ← Sketch to Layout (private, signed)
├── visualiser-captures      ← Plant Visualiser compositions
├── plant-sprites            ← Visualiser sprites
├── community-guide-images   ← Community Guide Editor
├── yield-photos             ← YieldTab
└── chat-uploads             ← PlantDoctorChat attachments

DB tables that reference media:
├── inventory_item_photos    ← timeline rows
├── plant_journals           ← per-entry image_url; inventory_item_id is NULLABLE (Quick Capture entries are unassigned until filed)
├── photo_observations       ← Garden Brain Phase 3: ONE nightly AI vision analysis per plant-linked journal photo (journal_id UNIQUE); growth_stage, health, findings, confidence, actions jsonb (closed vocabulary, per-action status). See [Garden Brain](./39-garden-brain.md)
├── plan_photos              ← gallery rows
├── plants.default_image     ← single URL
├── inventory_items.cover_image_url
├── inventory_items.sprite_url
├── plans.cover_image_url
└── visualiser_captures.image_url
```

---

## Role 1 — Technical Reference

### Bucket access patterns

| Bucket | Public read? | RLS write |
|--------|-------------|-----------|
| instance-photos | Public | author + home member |
| journal-photos | Public | author |
| plan-photos | Public | home member with `planner.write` |
| plan-covers | Public | service role only (set by edge fn) |
| task-photos | Public | task assignee / home editor |
| plant-doctor-images | Public | author |
| plant-doctor-results | Private | service role |
| ailment-photos | Public | home member |
| area-scans | Public | author |
| garden-sketches | Private (signed) | service role (edge fn mints signed URLs) |
| visualiser-captures | Private (signed) | home member |
| plant-sprites | Public | home member |
| community-guide-images | Public | guide author |
| yield-photos | Public | author |
| chat-uploads | Public | author |

### `inventory_item_photos`

The photo timeline rows:

```ts
{ id, inventory_item_id, photo_url, caption?, created_at }
```

### `plant_journal`

Free-text journal entries with optional photo:

```ts
{ id, inventory_item_id, user_id, home_id, body, photo_url?, created_at }
```

### Resize / compress

`PhotoUploader` resizes to max 1600px longest edge, JPEG 85% quality client-side before upload.

### Orphan cleanup (planned)

A future cron sweeps each bucket for files with no row reference (deleted DB row but file lingered).

### Signed URL TTL

Private buckets (visualiser-captures) use 1-hour signed URLs.

---

## Role 2 — Expert Gardener's Guide

### Why so many buckets

Different media has different lifecycle + access patterns:
- Plant photos persist; AI doctor results expire.
- Public reference photos (plant sprites) need permissive read.
- Private captures (visualiser) get signed URLs.

Users rarely think about buckets — they upload via the relevant screen and Rhozly handles the rest.

### Implications

- Deleting a plant doesn't immediately delete its photos (orphan cleanup catches later).
- Photos referenced in JSON exports (Data Export) are URLs, not bundled bytes.

---

## Related reference files

- [Photo Uploader](../08-modals-and-overlays/27-photo-uploader.md)
- [Data Export Section](../06-account/07-data-export.md)

## Code references for ongoing maintenance

- `src/components/PhotoUploader.tsx`
- Storage bucket policies in Supabase dashboard
