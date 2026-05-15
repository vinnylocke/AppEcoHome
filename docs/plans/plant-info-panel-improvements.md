# Plan — Plant Info Panel Improvements

## Three Changes

---

### 1 — Spinner on info button during loading

Currently the info button shows `<Info>` icon while the care guide is fetching. The panel shows a skeleton, but the button itself gives no feedback.

**Change:** When `loadingDetailsIds.has(id)` for a given result, replace the `<Info>` icon on the button with `<Loader2 className="animate-spin">`. This applies to every info button in `BulkSearchModal`, `PlantSourcePicker`, and `AddItemSheet` — AI and DB results alike.

---

### 2 — Auto-prefetch care guides for AI results on load

Currently care data only fetches when the user clicks the info icon. For AI results, the user asked to kick off the fetch as soon as the result list populates so pills/description are ready immediately on expand.

**Change:** Add a `useEffect` in each component that watches the AI results state and calls `fetchDetails(match)` for each AI match as soon as it appears. The existing `fetchingDetailsRef` de-duplicates so parallel calls for the same plant are safe.

| Component | Trigger state | Notes |
|-----------|--------------|-------|
| `BulkSearchModal` | `aiResults` (string array) | Same array already watched for old Wikipedia auto-load |
| `PlantSourcePicker` | `results` record — per-plant `r.ai` arrays once `r.loading === false` | Iterate plant names, iterate `r.ai` |
| `AddItemSheet` | `externalAiResults` | Triggered after `handleSearchAll` resolves |

DB results (Perenual/Verdantly) remain lazy — they already have a thumbnail in the search result card, so there is no urgent reason to pre-fetch their full details.

---

### 3 — Image gallery below description in PlantInfoPanel

Add a horizontal scrolling image strip at the bottom of the info panel (below the description) using the `plant-image-search` edge function (Unsplash + Pixabay + Wikipedia, already deployed).

**`PlantInfoPanel` prop addition:**
```typescript
interface Props {
  details: PlantDetails | null;
  loading: boolean;
  plantName?: string; // triggers image gallery fetch
}
```

When `plantName` is provided and `details` becomes non-null:
- Invoke `plant-image-search` with `{ query: plantName, count: 4 }`
- Show a horizontal scroll of up to 4 thumbnail images (square, ~64px)
- Clicking a thumbnail opens `full_url` in a new tab
- While loading: 3 skeleton squares
- If all fail: no section shown (silent)

Images are fetched **lazily** (only when the panel is open and `details` is loaded), not on auto-prefetch — to avoid unnecessary Unsplash quota usage for panels the user never opens.

**`plantName` plumbing:**
- `BulkSearchModal`: AI results pass `match.split("(")[0].trim()`, DB results pass `plant.common_name`
- `PlantSourcePicker`: same pattern
- `AddItemSheet`: same pattern

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/PlantInfoPanel.tsx` | Add `plantName` prop + image gallery section + internal image fetch |
| `src/components/BulkSearchModal.tsx` | Spinner on info buttons; auto-prefetch `useEffect`; pass `plantName` to panel |
| `src/components/PlantSourcePicker.tsx` | Spinner on info buttons; auto-prefetch `useEffect`; pass `plantName` to panel |
| `src/components/shopping/AddItemSheet.tsx` | Spinner on info buttons; auto-prefetch `useEffect`; pass `plantName` to panel |
