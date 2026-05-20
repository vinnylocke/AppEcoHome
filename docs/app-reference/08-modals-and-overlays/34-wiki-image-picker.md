# Wiki Image Picker

> A small Wikipedia/Wikimedia Commons image picker, used inside Manual Plant Creation for the cover image and inside Sprite Wizard's Wikipedia tab.

**Source file:** `src/components/WikiImagePicker.tsx`

---

## Quick Summary

Type a plant name → calls `getPlantWikiInfo` / Wikipedia search → returns up to N images. User picks one → URL is returned via `onChange`. Free public-domain or Commons-licensed imagery (no auth required).

---

## Role 1 — Technical Reference

### Component graph

```
WikiImagePicker
├── Search input (auto-populated from plant name if provided)
├── Image grid (results)
│   └── Thumbnail (tap to select)
├── Preview (selected)
└── Confirm / Clear
```

### Props (typical)

| Prop | Type | Purpose |
|------|------|---------|
| `query` | `string` | Initial search |
| `value` | `string \| null?` | Current image URL |
| `onChange` | `(url \| null) => void` | Callback |

### Data flow — read paths

- Wikipedia REST API search.
- Wikipedia "thumbnail" endpoint for each candidate.

### Data flow — write paths

None — returns URL via prop; parent decides what to do with it.

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

None.

### Error states

| State | Result |
|-------|--------|
| Wikipedia API unreachable | Empty grid + retry |
| No matches | "No images found — try a different search" |

### Performance

- Single REST call.
- Image lazy-loading.

### Linked storage buckets

None — URLs reference Wikipedia/Commons directly.

---

## Role 2 — Expert Gardener's Guide

### Why use this picker

When creating a manual plant or assigning a sprite, you usually want a representative photo. Wikipedia + Commons cover most species with CC0 / CC-BY imagery — free, attributable.

### Every flow

#### 1. Search

- Auto-populated from plant name. Tweak if needed.

#### 2. Pick

- Tap a thumbnail.

#### 3. Confirm

- URL returned to parent.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Picking a flower close-up when you want the whole plant.** Search variations help.
- **CC-BY without attribution.** Rhozly displays attribution automatically; if you re-use elsewhere, credit.

### Recommended workflows

- **Manual plant:** rough common name → Wiki picker → done.
- **Sprite Wizard fallback:** when Pixabay doesn't have a good image, Wikipedia often does.

### What to do if something looks wrong

- **Empty grid:** species not on Wikipedia. Try a more generic search.
- **Image broken later:** Wikipedia URL changed. Re-pick.

---

## Related reference files

- [Manual Plant Creation](./33-manual-plant-creation.md)
- [Sprite Wizard](../05-tools/06-sprite-wizard.md)

## Code references for ongoing maintenance

- `src/components/WikiImagePicker.tsx`
- `src/lib/wikipedia.ts` — `getPlantWikiInfo`
