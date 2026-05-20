# Plant Journal Tab

> A timeline of free-text notes attached to a specific plant instance. Useful for "noticed mildew on south leaves", "moved 6 inches to the right", "second flush starting" — anything you want to remember later.

**Trigger:** Inside InstanceEditModal → Journal tab.
**Source file:** `src/components/PlantJournalTab.tsx`

---

## Quick Summary

Add entries, edit existing entries inline, delete with confirm. Entries timestamped. Optional photo attachment per entry via PhotoUploader inline (separate from the Photo Timeline tab).

---

## Role 1 — Technical Reference

### Component graph

```
PlantJournalTab
├── Add entry composer (textarea + photo + save)
├── Entry list (newest first)
│   └── Entry card
│       ├── Body
│       ├── Photo (if attached)
│       ├── Timestamp
│       ├── Edit (inline)
│       └── Delete
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `instanceId` | `string` | parent | Scope |
| `homeId` | `string` | parent | For photo uploads |

### Data flow — read paths

```ts
supabase.from("plant_journal")
  .select("*")
  .eq("inventory_item_id", instanceId)
  .order("created_at", desc);
```

### Data flow — write paths

| Action | DB |
|--------|----|
| Add | `plant_journal.insert(...)` |
| Edit | `plant_journal.update({ body, photo_url }).eq("id", id)` |
| Delete | `plant_journal.delete().eq("id", id)` |

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Author-only edit (`user_id = auth.uid()`) via RLS.

### Error states

| State | Result |
|-------|--------|
| Save fails | Inline error |
| Delete fails | Toast |

### Performance

- Lightweight; list re-render on each write.

### Linked storage buckets

- `journal-photos` — per-entry photos.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

A garden journal you don't have to remember to open. Notes attached to the plant they're about — so next year you can come back and see "I planted this on March 14th and it bloomed on May 20th".

### Every flow on this tab

#### 1. Add an entry

- Textarea → optional photo → Save.

#### 2. Edit

- Pencil → inline edit → Save.

#### 3. Delete

- Trash → confirm.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Writing notes in the plant edit form instead.** Use Journal for time-stamped observations.

### Recommended workflows

- **Once a week per active plant.** Even a one-liner builds value over a season.
- **After significant events.** Pest outbreak, harvest, pruning — log it.

### What to do if something looks wrong

- **Entries missing:** check user — RLS scopes to author.

---

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Photo Uploader](./27-photo-uploader.md)

## Code references for ongoing maintenance

- `src/components/PlantJournalTab.tsx`
- `supabase/migrations/*_plant_journal.sql`
- `journal-photos` bucket
