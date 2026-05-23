# Plan — show stored values for plant_type / cycle / watering / care_level

## Bug

`plant_type`, `cycle`, `watering`, `care_level` etc. are rendered as native HTML `<select>` elements in `ManualPlantCreation`. Each has a small hard-coded `<option>` list. When the AI returns a value that isn't in the list (e.g. plant_type "Herb" when the options are only Shrub / Tree / Flower / Vegetable / Houseplant), the browser shows nothing — the select has no matching option, so it falls back to the empty placeholder. The data is on the row; it just can't render.

User's idea: pass the canonical values to the AI as examples, and have the modal still show whatever's stored. Both halves needed.

## Fix

### A. Dropdowns accept arbitrary stored values

Patch the half-dozen constrained-vocab `<select>`s in `ManualPlantCreation` so the row's current value is ALWAYS rendered, even when it's not in the canonical option list. Two-line change per dropdown — synthesise an extra `<option value={currentValue}>{currentValue}</option>` ahead of the canonical options when the value isn't already there.

Fields to fix (any constrained-vocab `<select>` where AI might return an out-of-list value):

- plant_type
- cycle
- watering
- care_level
- maintenance
- growth_rate

### B. Seed prompt — canonical-value hints

Tell the AI the preferred values for each constrained field. Allow "or a similar descriptor if none of these fit" so AI isn't locked into the canonical list.

```
PREFERRED VALUES for constrained fields. Use ONE of these where applicable; otherwise pick the closest sensible descriptor in the same form:
- plant_type: Shrub, Tree, Flower, Vegetable, Houseplant, Herb, Succulent, Climber, Grass, Fern, Cactus, Bulb, Vine, Groundcover, Aquatic
- cycle: Perennial, Annual, Biennial, Herbaceous Perennial
- watering: frequent, average, minimum
- care_level: low, medium, high
- growth_rate: slow, moderate, fast
- maintenance: low, moderate, high
```

The dropdown patch (#A) means even if AI returns something outside this list, the value still renders. The hint just nudges consistency.

## Files

| File | Change |
|------|---------|
| `src/components/ManualPlantCreation.tsx` | Inject dynamic `<option>` for the current value in the six constrained dropdowns |
| `supabase/functions/seed-plant-library/index.ts` | Add preferred-values block to `buildSeedPrompt` |

No schema changes, no migrations. UI fix is two lines per dropdown; prompt fix is additive.

## Sequencing

Edit two files → typecheck → deploy. Quick win.
