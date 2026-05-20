# Plan Reference Photos

> A collapsible photo gallery attached to a plan — inspiration shots, "this is what I want it to look like" references, in-progress photos for the build, before/after comparisons.

**Trigger:** Rendered inside Plan Staging (per plan).
**Source file:** `src/components/PlanReferencePhotos.tsx`

---

## Quick Summary

Plans get a `plan_photos` table separate from `plans.cover_image_url`. This component renders the grid, an "Add Photo" flow (via `PhotoUploader`), a captioned lightbox, and a delete button. Photos live in the `plan-photos` storage bucket.

---

## Role 1 — Technical Reference

### Component graph

```
PlanReferencePhotos
├── Header (collapsible toggle, count badge)
└── Expanded body
    ├── Loading spinner
    ├── Empty state ("No reference photos yet")
    ├── Photo grid
    │   ├── Thumbnail (tap → lightbox)
    │   └── Delete button (per photo)
    ├── Add Photo button
    ├── PhotoUploader (when adding)
    │   ├── Drop / browse zone
    │   ├── Caption input
    │   └── Save button
    ├── Lightbox modal (full-size view + caption)
    └── Delete confirm modal
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `planId` | `string` | PlanStaging | Scope |
| `homeId` | `string` | PlanStaging | For DB write |
| `defaultOpen` | `boolean` | PlanStaging | Whether to render expanded |

### Local state

| State | Purpose |
|-------|---------|
| `open` | Expanded vs collapsed |
| `loading` | Initial fetch |
| `photos` | Fetched rows |
| `adding` | Upload mode active |
| `newPhotoUrl`, `newCaption` | New-photo form values |
| `saving` | Insert in flight |
| `lightboxIndex` | Active lightbox photo index |
| `deleteId` | Delete confirm target |

### Data flow — read paths

```ts
supabase.from("plan_photos")
  .select("id, photo_url, caption, created_at")
  .eq("plan_id", planId)
  .order("created_at", { ascending: false });
```

### Data flow — write paths

#### Add
```ts
supabase.from("plan_photos").insert({
  plan_id, home_id, photo_url, caption, created_by: user.id
});
```
Photo upload itself is handled by `PhotoUploader` — that component uploads to the `plan-photos` storage bucket and returns the public URL.

#### Delete
```ts
supabase.from("plan_photos").delete().eq("id", id);
```
Note: the storage file is NOT deleted (cheaper to leave orphaned; the bucket has a periodic cleanup).

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| Storage orphan cleanup (planned) | Removes plan-photos files with no DB row |

### Realtime channels

None.

### Tier gating

None — photos available to every tier.

### Beta gating

None.

### Permissions

- `planner.write` — non-writers can view but not add/delete.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Empty state with retry implicit (re-open) |
| Save fails | Toast with retry option |
| Delete fails | Toast; row stays |

### Performance

- Lazy-renders body only when `open === true`.
- Lightbox lazy-renders on tap.
- Image grid uses next/image-style lazy loading via standard `<img loading="lazy">`.

### Linked storage buckets

- `plan-photos` — public read; RLS write requires `home_members.role in ('owner','editor')`.

---

## Role 2 — Expert Gardener's Guide

### Why use this section

A plan is a multi-step project, and projects evolve. Saving reference photos in the same place as the plan keeps the visual brief alive. Snap an inspiration image from a magazine; upload the photo of the bed before you started; document the "during" mid-build; close with the finished result. It's both a planning aid (visual brief) and a journal (look-back).

### Every flow on this card

#### 1. Expand the section

- Tap the header chevron. Default collapsed to save vertical space inside Plan Staging.

#### 2. Add a photo

- Tap "Add Photo" → `PhotoUploader` opens.
- Drop, browse, or take a photo (mobile uses native camera/library picker).
- Add a caption (optional but useful — "South-facing wall before clearing").
- Save.

#### 3. Browse the gallery

- Newest first.
- Tap any thumbnail → lightbox with caption + delete.

#### 4. Delete

- Trash icon → confirm. Removes the DB row; storage file persists temporarily.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Photo thumbnail | A reference / inspiration / progress photo |
| Caption | Free-text annotation |
| Date | When you added it |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Confusing reference photos with the cover image.** Cover image is the AI-generated render at the top of the plan card; reference photos are user-uploaded extras.
- **Uploading huge photos.** They display fine but eat storage. The uploader doesn't resize aggressively yet.
- **Captions trail off.** Mobile keyboard auto-correct can mangle them. Edit by deleting + re-uploading (no inline edit yet).

### Recommended workflows

- **Project start:** drop 3–5 inspiration photos to anchor the brief.
- **Mid-build:** snap progress photos weekly.
- **Completion:** upload "after" shot. Now the plan card history shows the full arc.

### What to do if something looks wrong

- **Photo upload failed:** check connectivity, storage quota, file size.
- **Photo deleted but still shows:** refresh; UI state cleared but if the DB delete failed, you'll see it return.

---

## Related reference files

- [Plan Staging](./02-plan-staging.md)
- [Photo Uploader](../08-modals-and-overlays/27-photo-uploader.md)
- [Media Data Model (cross-cutting)](../99-cross-cutting/07-data-model-media.md)

## Code references for ongoing maintenance

- `src/components/PlanReferencePhotos.tsx` — this component
- `src/components/PhotoUploader.tsx` — upload sub-component
- `supabase/migrations/*_plan_photos.sql` — table + RLS
- `plan-photos` storage bucket policies
