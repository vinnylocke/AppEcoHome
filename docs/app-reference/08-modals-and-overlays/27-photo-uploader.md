# Photo Uploader

> The reusable photo upload component used across the app — Plant Journal, Photo Timeline, Yield, Plan Reference Photos, Task completion, etc. Handles camera capture on mobile + library picker + drag-drop on desktop. Client-side resize + JPEG re-encode to keep storage costs sensible.

**Source file:** `src/components/PhotoUploader.tsx`

---

## Quick Summary

A drop/browse/camera zone. Picks a file → resizes to max 1600px longest edge at 85% JPEG quality → uploads to specified Supabase Storage bucket → returns public URL via `onChange`. Shows preview thumbnail with delete; uploading state shows spinner.

Camera capture uses `<input capture="environment">` for web and Capacitor Camera for native.

---

## Role 1 — Technical Reference

### Component graph

```
PhotoUploader
├── Dropzone (when no value)
│   ├── Camera button
│   ├── Library button
│   └── Drag-drop hint (desktop)
├── Preview (when value)
│   ├── Image
│   └── Delete button
└── Loading overlay (during upload)
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `bucket` | `string` | Supabase Storage bucket |
| `pathPrefix` | `string` | Path within bucket |
| `value` | `string \| null?` | Existing URL |
| `onChange` | `(url \| null) => void` | Callback (null = removed) |
| `maxSizeMb` | `number?` | Default 5 |
| `label` | `string?` | Dropzone label |
| `aspectClass` | `string?` | Tailwind aspect ratio |
| `testIdPrefix` | `string?` | Test id namespace |
| `onUploadStart` / `onUploadEnd` | `() => void?` | Lifecycle hooks |
| `disabled` | `boolean?` | Block interaction |

### Compression

```ts
compressImage(file) // → max 1600px longest, JPEG 85%
```

Falls back to original file on any compression failure (never blocks upload).

### Data flow — write paths

```ts
// 1. compress
// 2. upload to bucket/pathPrefix/{uuid}.jpg
// 3. supabase.storage.from(bucket).getPublicUrl(path)
// 4. onChange(publicUrl)
```

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| Orphan cleanup (planned) | Removes upload files with no row reference |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Storage write permission per bucket RLS.

### Error states

| State | Result |
|-------|--------|
| File too large | Toast |
| Upload fails | Toast |
| Camera not granted | Falls back to library |

### Performance

- Client-side compression keeps payloads small (~200-500 KB typical).
- Single fetch per upload.

### Linked storage buckets

Varies per use site — bucket prop selects.

---

## Role 2 — Expert Gardener's Guide

### Why use this

Anywhere Rhozly asks for a photo, this is the component. Mobile users get camera + library buttons; desktop adds drag-drop.

### Every flow

#### 1. Take or pick

- Camera or library on mobile; drag-drop or browse on desktop.

#### 2. Wait for compress + upload

- Usually 1-2 seconds for compress; 1-3 seconds for upload depending on network.

#### 3. Preview + remove

- Once uploaded, the preview shows; tap trash to remove.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Uploading a 25 MB photo expecting full resolution.** Compression caps at 1600px — fine for app use, not for printing.
- **Permission denied for camera:** browser-specific; check settings.

### Recommended workflows

- Just use it. The compression + upload is largely invisible.

### What to do if something looks wrong

- **Upload stuck:** big file + slow network. Wait or retry.
- **Camera button missing:** browser unsupported; use library.

---

## Related reference files

Used throughout. Notable surfaces:
- [Photo Timeline Tab](./09-photo-timeline-tab.md)
- [Plant Journal Tab](./10-plant-journal-tab.md)
- [Yield Tab](./12-yield-tab.md)
- [Plan Reference Photos](../04-planner/03-plan-reference-photos.md)
- [Task Detail Modal](./02-task-modal.md)

## Code references for ongoing maintenance

- `src/components/PhotoUploader.tsx`
- Various bucket policies
