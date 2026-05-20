# Photo Timeline Tab

> The Photos tab inside InstanceEditModal. A chronological gallery of photos uploaded to this specific plant instance, with pin-as-cover, lightbox preview, and bulk delete.

**Trigger:** Inside InstanceEditModal → Photos tab.
**Source file:** `src/components/PhotoTimelineTab.tsx`

---

## Quick Summary

Fetches `inventory_item_photos` for the instance, newest first. Each thumb opens a lightbox; the user can pin any photo as the instance's cover (`inventory_items.cover_image_url`). PhotoUploader appears at the top of the grid for adding.

---

## Role 1 — Technical Reference

### Component graph

```
PhotoTimelineTab
├── PhotoUploader (top of grid)
├── Photo grid (newest first)
│   └── Thumbnail
│       ├── Tap → lightbox
│       ├── Pin → set cover_image_url
│       └── Delete button
└── Lightbox modal
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `instanceId` | `string` | parent | Scope |
| `homeId` | `string` | parent | For PhotoUploader |
| `onCoverChange` | `() => void?` | parent | Triggers cover refetch in parent modal |

### Data flow — read paths

```ts
supabase.from("inventory_item_photos")
  .select("id, photo_url, caption, created_at")
  .eq("inventory_item_id", instanceId)
  .order("created_at", desc);
```

### Data flow — write paths

- Add: `inventory_item_photos.insert(...)` (PhotoUploader handles bucket upload).
- Pin as cover: `inventory_items.update({ cover_image_url }).eq("id", instanceId)`.
- Delete: `inventory_item_photos.delete().eq("id", id)`.

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| Bucket orphan cleanup (planned) | Removes orphan files post-delete |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `inventory.edit` for add/delete/pin.

### Error states

| State | Result |
|-------|--------|
| Upload fails | Toast |
| Delete fails | Toast |

### Performance

- Lazy image loading.
- Lightbox lazy-mounted.

### Linked storage buckets

- `instance-photos` — uploaded images.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

Watching your plant grow is one of the most satisfying parts of gardening. A monthly photo over a season is a beautiful record. Pinning the best one as the cover image makes the Shed grid visually rich.

### Every flow on this tab

#### 1. Upload

- PhotoUploader at the top → drop, browse, or camera.

#### 2. View

- Tap any thumb → lightbox with caption + delete + pin.

#### 3. Pin as cover

- "Pin" button on a photo → that photo becomes the instance's cover.

#### 4. Delete

- Trash → confirm in lightbox.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Uploading too-large images.** Browsers may resize transparently; storage gets bloated.
- **Pinning then deleting the cover.** Cover falls back to placeholder.

### Recommended workflows

- **Monthly during growing season.** Same angle, same time of day, same plant — a satisfying timelapse.

### What to do if something looks wrong

- **Upload spinning:** large file or slow network. Wait or retry smaller.
- **Cover didn't update:** switch tab and back.

---

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Photo Uploader](./27-photo-uploader.md)

## Code references for ongoing maintenance

- `src/components/PhotoTimelineTab.tsx`
- `src/components/PhotoUploader.tsx`
- `instance-photos` bucket policies
