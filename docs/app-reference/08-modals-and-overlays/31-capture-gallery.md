# Capture Gallery

> Gallery of past Plant Visualiser compositions for this home. Shows thumbnails, lightbox preview, delete per capture.

**Source file:** `src/components/CaptureGallery.tsx`

---

## Quick Summary

Opens from the Capture-count badge inside Plant Visualiser. Fetches `visualiser_captures` rows; for each, generates a 1h signed URL from the `visualiser-captures` bucket. Grid of thumbnails → lightbox with arrow-key + button navigation → delete with confirm.

---

## Role 1 — Technical Reference

### Component graph

```
CaptureGallery (Portal)
├── Header (close, title)
├── Loading / empty / grid
│   └── Capture thumbnail
│       ├── Tap → lightbox
│       └── Delete button
└── Lightbox
    ├── Image
    ├── Prev / Next
    ├── Date
    └── Delete
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `onClose` | `() => void` | parent | Hide |

### `Capture` shape

```ts
{
  id, image_url, plant_ids: number[] | null, created_at,
  signedUrl?,
}
```

### Data flow — read paths

```ts
supabase.from("visualiser_captures")
  .select("id, image_url, plant_ids, created_at")
  .eq("home_id", homeId)
  .order("created_at", desc);

// per row:
supabase.storage.from("visualiser-captures")
  .createSignedUrl(row.image_url, 3600);
```

### Data flow — write paths

- Delete: `visualiser_captures.delete().eq("id", id)` + storage delete.

### Edge functions invoked

None.

### Cron / scheduled jobs

None directly.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `inventory.read` to see; author for delete.

### Error states

| State | Result |
|-------|--------|
| Signed URL fails | Image shown broken; can still delete |
| Delete fails | Toast |

### Performance

- Per-row signed URL generation; can be batched if needed.
- Lightbox lazy on tap.

### Linked storage buckets

- `visualiser-captures` — private, signed URLs.

---

## Role 2 — Expert Gardener's Guide

### Why use this gallery

To look back at past garden compositions. Useful for "what did I plan for this bed last spring?" or sharing the visualised plan with family.

### Every flow

#### 1. Browse grid

- Newest first.

#### 2. Lightbox

- Tap a thumbnail → full image + arrow navigation.

#### 3. Delete

- Trash on thumbnail or in lightbox.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Deleting cherished compositions.** No undo — be deliberate.
- **Expecting it to track changes.** Capture is a snapshot, not a living document.

### Recommended workflows

- **Pre-planting:** capture the visualisation; revisit later to compare to reality.

### What to do if something looks wrong

- **Broken thumbnails:** signed URL expired (1h TTL). Reopen.
- **Storage delete failed:** the DB row may be gone but the file lingers — orphan cleanup will catch it.

---

## Related reference files

- [Plant Visualiser](../05-tools/05-plant-visualiser.md)
- [Sprite Wizard](../05-tools/06-sprite-wizard.md)
- [Plant Camera View](./32-plant-camera-view.md)

## Code references for ongoing maintenance

- `src/components/CaptureGallery.tsx`
- `visualiser-captures` bucket policies
