# Manual Plant Creation

> The "create your own plant record" form. Used as the escape hatch when Perenual / Verdantly / AI all fail to know about a plant. Captures common + scientific names, sun/water/soil/cycle, hardiness, propagation, image (via WikiImagePicker), and care notes.

**Source file:** `src/components/ManualPlantCreation.tsx`

---

## Quick Summary

A long form that creates a `plants` row with `source = "manual"`. Used standalone (from BulkSearch's "Create manually" button) or as the "Care details" body inside PlantEditModal for manual plants.

---

## Role 1 — Technical Reference

### Component graph

```
ManualPlantCreation
├── Common name + Scientific names input
├── Cover image (WikiImagePicker)
├── Sun preference (multi-select)
├── Watering (single)
├── Cycle dropdown
├── Hardiness range slider
├── Propagation method
├── Care notes (textarea)
├── Save / Cancel
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `initialData` | `any?` | Edit mode |
| `onSave` | `(data) => void?` | Save callback |
| `onCancel` | `() => void?` | Hide |
| `isSaving` | `boolean?` | In-flight spinner |
| `submitLabel` | `string?` | Default "Save" |
| `isReadOnly` | `boolean?` | View-only mode |

### Constants

```ts
SUNLIGHT_OPTIONS  = full sun / part sun / part shade / filtered shade / full shade
CYCLE_OPTIONS     = Perennial / Annual / Biannual / Herbaceous Perennial
PROPAGATION_OPTIONS = Seed / Bulb / Cuttings / Division / Layering / Grafting
```

### Data flow — write paths

Parent's `onSave(data)`:

```ts
supabase.from("plants").insert({
  home_id, source: "manual",
  common_name, scientific_name: [...],
  sunlight: [...], watering, cycle,
  hardiness: { min, max },
  default_image: imageUrl,
  notes,
});
```

### Edge functions invoked

None directly. WikiImagePicker may call Wikipedia.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — manual is always available.

### Beta gating

None.

### Permissions

- `shed.add` for insert.

### Error states

| State | Result |
|-------|--------|
| No common name | Inline error |
| Save fails | Toast |

### Performance

- Lightweight form.

### Linked storage buckets

- Wikipedia / external image URLs — not Rhozly storage.

---

## Role 2 — Expert Gardener's Guide

### Why use this form

For plants the providers don't know about — rare cultivars, family heirlooms, ornamental cultivars the database missed. Manual = full control over the record.

### Every flow

#### 1. Names

- Common name is required. Scientific names are best-effort.

#### 2. Image

- WikiImagePicker fetches Wikipedia images; pick one.

#### 3. Care defaults

- Sun, water, cycle, hardiness, propagation — fill what you know; leave blank where unsure.

#### 4. Save

- Inserts `plants` row with `source = "manual"`.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Skipping scientific name.** Some downstream features rely on it (companion lookup, etc.).
- **Over-precise hardiness.** Range is hint, not contract.

### Recommended workflows

- **Rare cultivar:** create manually with as much detail as you have, then iterate over the season.

### What to do if something looks wrong

- **Image not loading:** picker may have failed. Try without image; add later.
- **Save fails:** check `shed.add` permission.

---

## Related reference files

- [Bulk Search Modal](./04-bulk-search-modal.md)
- [Plant Search Modal](./05-plant-search-modal.md)
- [Plant Edit Modal](./06-plant-edit-modal.md)
- [Wiki Image Picker](./34-wiki-image-picker.md)

## Code references for ongoing maintenance

- `src/components/ManualPlantCreation.tsx`
- `src/components/WikiImagePicker.tsx`
