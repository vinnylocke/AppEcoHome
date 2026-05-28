# Plant Journal Tab

> A timeline of free-text notes attached to a specific plant instance. Useful for "noticed mildew on south leaves", "moved 6 inches to the right", "second flush starting" — anything you want to remember later.

**Trigger:** Inside InstanceEditModal → Journal tab.
**Source file:** `src/components/PlantJournalTab.tsx`

---

## Quick Summary

Add entries, edit existing entries inline, delete with confirm. Entries timestamped. Optional photo attachment per entry via PhotoUploader inline (separate from the Photo Timeline tab).

**Note:** this tab and the [Global Journal](../03-garden-hub/11-global-journal.md) read from the same `plant_journals` table. Entries created here appear in the global feed; entries created in the global composer with this plant as the target appear here. Auto-created entries (from `journalAutoUpdateService` when a task completion matches the user's auto-update preferences) also surface here when the task is tied to this instance.

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
supabase.from("plant_journals")
  .select("*")
  .eq("inventory_item_id", instanceId)
  .order("created_at", desc);
```

### Data flow — write paths

| Action | DB |
|--------|----|
| Add | `plant_journals.insert(...)` |
| Edit | `plant_journals.update({ body, photo_url }).eq("id", id)` |
| Delete | `plant_journals.delete().eq("id", id)` |

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

## Notes on unassigned entries (Mobile Quick Access Wave 4)

The `plant_journals.inventory_item_id` column is nullable. Rows without an `inventory_item_id` are created by the [Quick Capture Journal](../02-dashboard/11-quick-capture-journal.md) screen at `/quick/journal` — capture-first, assign-later workflow.

This tab is unaffected by unassigned rows because its read filters by `inventory_item_id = instanceId`, so unassigned drafts never appear here. Once a Quick Capture entry is assigned to a plant via the AssignToPlantSheet, it shows up in this tab like any other entry.

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Photo Uploader](./27-photo-uploader.md)
- [Quick Capture Journal](../02-dashboard/11-quick-capture-journal.md) — sibling capture-first surface; entries land here once assigned

## Code references for ongoing maintenance

- `src/components/PlantJournalTab.tsx`
- `supabase/migrations/*_plant_journals.sql`
- `journal-photos` bucket
