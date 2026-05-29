# Plant Detail Modal

> A full plant detail overlay — Care Guide, Grow Guide, Companions and Light tabs — for a plant the user is *considering* but hasn't added yet. Opened from "See full care" in the Add-to-Shed search preview.

**Route / how to reach it:** No route. Rendered as a portal overlay by a host. Hosts today:
- `BulkSearchModal` (Add-to-Shed) → tap a result's ⓘ → "See full care".
- `AddItemSheet` (Shopping list "Add Plant") → ⓘ → "See full care".
- `CompanionPlantsTab` → tap a companion's name (opens that companion's full guide).
- `SceneMapResultCard` (Plant Doctor **Multi-ID**) → a detected plant's ⓘ → "See full care".
**Source files (entry points):**
- `src/components/PlantDetailModal.tsx` — the overlay
- `src/hooks/useCataloguePlantFromResult.ts` — ensures a catalogue plant from a search result

---

## Quick Summary

Lets a gardener inspect a plant's complete care information — not just the quick info panel — before committing to add it. It reuses the same tabs as the Library's full-screen `PlantPreview`, but as an overlay so the user stays in their Add-to-Shed search with their multi-select cart intact.

---

## Role 1 — Technical Reference

### Component graph
- `PlantDetailModal.tsx` — portal (`createPortal` to `document.body`), z-`[140]` by default (above a host modal at z-`[100]`).
  - `ManualPlantCreation` (read-only) — the Care Guide tab body.
  - `GrowGuideTab` — Grow Guide tab (gated on a real `plantId`).
  - `CompanionPlantsTab` — Companions tab.
  - `LightTab` — Light tab.

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `result` | `ProviderSearchResult` | host (mapped from a `PlantSelection`) | The plant to detail. Library hits arrive as `{_provider:"ai", plant_library_id}`. |
| `homeId` | `string` | host | Scope for catalogue clone + tab edge fns. |
| `aiEnabled` | `boolean` | host | Gates Grow Guide generation (Sage+). |
| `isPremium` | `boolean` | host | Passed to `CompanionPlantsTab`. |
| `onClose` | `() => void` | host | Dismiss; host state (cart) is untouched. |
| `zIndexClassName?` | `string` | host | Defaults `z-[140]` for stacking above a host modal. |

### State (local)
- `activeTab: "care" | "grow" | "companions" | "light"` — selected tab.
- Plant resolution is delegated to `useCataloguePlantFromResult(result, homeId)` → `{ plant, ensuring, error }`.

### Data flow — read paths
- **`useCataloguePlantFromResult`** renders an instant placeholder from `result`, then calls `ensureCataloguePlantFromSearchResult(result, { homeId })` (clones into the catalogue `plants` table; library rows via `ensureCataloguePlantFromLibrary`, dedup by scientific name — no Gemini). Resolves to a `CataloguePlant` with a positive `plantId`.
- **Grow Guide / Companions / Light** tabs fire their own edge-fn / cache reads once `plant.plantId > 0` (identical to `PlantPreview`). Until then they show a "Preparing the plant…" placeholder.

### Data flow — write paths
None directly. Inspection-only — there is **no Save**; the host (Add-to-Shed cart → import) owns adding the plant. The background catalogue clone is the only write, and it's idempotent (dedup by sci name).

### Edge functions invoked
Indirectly via the tabs: `generate-grow-guide` (Grow Guide, Sage+), companion lookup (via `companionCache`), light analysis (Light tab). Same as `PlantPreview`.

### Cron / scheduled jobs that affect this surface
None.

### Realtime channels
None.

### Tier gating
- **Sprout / Botanist:** Care Guide + Companions + Light render; Grow Guide shows its own upgrade state (generation is Sage+).
- **Sage / Evergreen:** all tabs fully functional, Grow Guide auto-generates.

### Beta gating
None.

### Permissions / role-based UI
Inherits the tabs' own behaviour; no extra permission checks in the overlay.

### Error states
- Catalogue clone fails → the modal shows a centred error message (other tabs stay gated on `plantId`).
- Tab-level failures surface inside each tab (unchanged from `PlantPreview`).

### Performance notes
- Only the active tab renders; tabs gate edge-fn calls on a real `plantId` so a bogus id is never queried.
- The placeholder paints instantly so the overlay never blanks.

### Linked storage buckets
None directly (images come through the tabs / image proxy).

---

## Role 2 — Expert Gardener's Guide

### Why open this screen
You're adding plants to your Shed and you find one you're not sure about. The quick ⓘ preview gives the basics, but you want the *full* picture before committing — how to grow it, what it pairs well with, how much light it needs. "See full care" opens exactly that, without making you abandon the list of plants you've already picked.

For Sarah (new gardener) it's reassurance: see the care guide and companions before adding, so the Shed only fills with plants she understands. For Marcus (expert) it's a fast cross-check — companions and grow timing — mid-bulk-add, then straight back to the list.

### Every flow on this page
1. **Tabs (Care / Grow / Companions / Light)** — tap to switch. Care shows instantly; the others prepare the plant first (a brief spinner) then load. *Beginner:* "what do I need to know to keep it alive?" *Expert:* "timing + pairings."
2. **Close (X / Esc)** — returns to the search with your cart and selections exactly as they were.

### Information on display — what every field means
Identical to the Library preview: Care Guide fields (sunlight, watering cadence, cycle, edibility, toxicity, wildlife), the Grow Guide timeline, the companion suggestions, and the light requirement band. See [Grow Guide Tab](./36-grow-guide-tab.md) and [The Library](../02-dashboard/12-the-library.md).

### Tier-by-tier experience
Grow Guide generation needs Sage+; the other three tabs work for everyone. Companions richness follows `isPremium`.

### New user vs returning user vs power user
- **New:** opens it to learn before adding — the safe default.
- **Returning:** a quick companions/light check.
- **Power:** rarely needed (they know the plant), but handy for an unfamiliar cultivar surfaced via the wider databases.

### Beta user experience
No difference.

### Common mistakes / pitfalls
- Expecting a "Save" here — there isn't one. Close the detail, then tick the plant in the list and use Review & Add. (This keeps the cart the single source of truth.)

### Recommended workflows
- Inspect → decide → close → select → Review & Add.

### What to do if something looks wrong
- A tab stuck on "Preparing the plant…" usually means the background catalogue step is still running or failed — close and reopen, or check connectivity.

---

## Related reference files
- [Plant Search — Unified, Library-First](../99-cross-cutting/36-plant-search.md) — the search + inline preview that opens this modal
- [The Library](../02-dashboard/12-the-library.md) — `PlantPreview`, the full-screen sibling using the same tabs
- [Grow Guide Tab](./36-grow-guide-tab.md)
- [Tier Gating](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance
- `src/components/PlantDetailModal.tsx` — the overlay
- `src/hooks/useCataloguePlantFromResult.ts` — catalogue-ensure + placeholder
- `src/components/library/PlantPreview.tsx` — the route-based sibling (shared tab components)
- `src/lib/plantCatalogue.ts` — `ensureCataloguePlantFromSearchResult` / `ensureCataloguePlantFromLibrary`
- `src/components/BulkSearchModal.tsx` — Add-to-Shed host (`onViewDetails` → opens this modal)
- `src/components/shopping/AddItemSheet.tsx` — Shopping host (`onViewDetails` → opens this modal)
- `src/components/CompanionPlantsTab.tsx` — opens this modal from a companion's name
- `src/components/lens/SceneMapResultCard.tsx` — Multi-ID host (`onViewDetails` equivalent: a detected plant's "See full care")
