# Yield Tab

> The harvest log inside InstanceEditModal. Record each harvest with quantity, unit, date, and an optional photo. View total yield to date and a per-harvest history.

**Source file:** `src/components/YieldTab.tsx`

---

## Quick Summary

Add yield entries (e.g. "1.2 kg tomatoes on 14 Aug"). View running total + per-entry list. Useful for edible crops to compare seasons and varieties.

---

## Role 1 — Technical Reference

### Component graph

```
YieldTab
├── Total card (sum of yields by unit)
├── Add yield composer (quantity + unit + date + optional photo)
├── Entry list (newest first)
│   └── Entry card (quantity, unit, date, photo, delete)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `instanceId` | `string` | parent | Scope |
| `homeId` | `string` | parent | For photo bucket |

### Data flow — read paths

```ts
supabase.from("yield_logs")
  .select("*")
  .eq("inventory_item_id", instanceId)
  .order("recorded_at", desc);
```

### Data flow — write paths

| Action | DB |
|--------|----|
| Add | `yield_logs.insert(...)` |
| Delete | `yield_logs.delete().eq("id", id)` |

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

- Author or `inventory.edit`.

### Error states

| State | Result |
|-------|--------|
| Save fails | Toast |
| Delete fails | Toast |

### Performance

- Lightweight.

### Linked storage buckets

- `yield-photos` — per-entry photos.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

Knowing what each crop yielded matters: how many courgettes from one plant, whether the heirloom tomato was worth the space, which variety beat the others. Yield logs are also the only way to track plant productivity over multiple seasons.

### Every flow on this tab

#### 1. Add yield

- Type quantity (e.g. 1.2) + pick unit (kg, g, count) + date → optional photo → Save.

#### 2. Review total

- Top card shows running total across all entries.

#### 3. Delete

- Trash on any entry.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Inconsistent units.** If you log some in kg and some in g, total may surprise — units are kept separate.
- **Forgetting to log small harvests.** Even handfuls add up.

### Recommended workflows

- **At each harvest:** log immediately. The "I'll log it later" never happens.
- **End of season:** review total — informs variety choices next year.

### What to do if something looks wrong

- **Total seems off:** check units; mixing creates separate sums.

---

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Stats Tab](../06-account/04-stats-tab.md) — Yields Logged aggregate

## Code references for ongoing maintenance

- `src/components/YieldTab.tsx`
- `supabase/migrations/*_yield_logs.sql`
- `yield-photos` bucket
