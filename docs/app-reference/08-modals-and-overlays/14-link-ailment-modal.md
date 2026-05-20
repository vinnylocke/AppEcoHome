# Link Ailment Modal

> A modal to link an existing watchlist ailment (pest / disease / invasive plant) to a specific plant instance. Adds a photo + notes per link.

**Source file:** `src/components/LinkAilmentModal.tsx`

---

## Quick Summary

Lists all `ailments` for the home; user searches/picks one (or many) and confirms the link. Inserts `plant_instance_ailments` rows with status="active". Optional photo + notes per link. May auto-generate treatment blueprints via `AutomationEngine`.

---

## Role 1 — Technical Reference

### Component graph

```
LinkAilmentModal (Portal, focus-trapped)
├── Header (close, plant name)
├── Search bar
├── Ailment list
│   └── Card (icon, name, type chip, already-linked badge)
├── Optional photo (PhotoUploader)
├── Optional notes textarea
├── Cancel / Link
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `plantInstance` | `object` | parent | The inventory item to link to |
| `onClose` | `() => void` | parent | Hide |
| `onLinked` | `() => void` | parent | Refresh on success |

### Type meta

```ts
{
  invasive_plant: orange chip,
  pest:           red chip,
  disease:        purple chip,
}
```

### Data flow — read paths

```ts
supabase.from("ailments").select("*").eq("home_id", homeId).order("name");
supabase.from("plant_instance_ailments")
  .select("ailment_id")
  .eq("plant_instance_id", plantInstance.id)
  .eq("status", "active");
```

### Data flow — write paths

```ts
supabase.from("plant_instance_ailments").insert({
  ailment_id, plant_instance_id, home_id,
  status: "active", photo_url, notes, linked_at: today,
});
// Optionally:
AutomationEngine.createTreatmentBlueprints({ ... });
```

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `generate-tasks` | Picks up new treatment blueprints |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `ailments.add` — required.

### Error states

| State | Result |
|-------|--------|
| Already linked | Badge on card; can't re-link |
| Insert fails | Toast |

### Performance

- Single-modal lookup.

### Linked storage buckets

- `ailment-photos` — per-link photos.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

When you see aphids on the tomatoes, you record it here: which plant, what ailment, optional photo + notes. The record drives Watchlist views, treatment task generation, and stats.

### Every flow on this modal

#### 1. Search / pick

- Filter the list by name.
- Tap to select; multi-select supported.

#### 2. Photo + notes (optional)

- Snap a photo of the issue; add notes.

#### 3. Confirm

- Links. If the ailment has a treatment plan, blueprints fire.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Linking the same ailment twice.** Already-linked is highlighted — re-link is a no-op.
- **Forgetting to add a new ailment first.** This modal only links existing ailments; add a new one via the Watchlist.

### Recommended workflows

- **On observation:** open the plant instance → Link Ailment → confirm → treatment tasks fire.

### What to do if something looks wrong

- **No ailments in list:** add some via the Watchlist first.
- **Link didn't show on Watchlist:** refresh the parent.

---

## Related reference files

- [Ailment Watchlist](../03-garden-hub/02-watchlist.md)
- [Instance Edit Modal](./08-instance-edit-modal.md)

## Code references for ongoing maintenance

- `src/components/LinkAilmentModal.tsx`
- `src/lib/automationEngine.ts`
- `supabase/migrations/*_plant_instance_ailments.sql`
