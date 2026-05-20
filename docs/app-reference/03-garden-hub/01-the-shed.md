# The Shed

> The plant inventory — everything you've added to your garden, whether planted yet or not. The main entry point for adding new plants, archiving old ones, and assigning plants to areas.

**Route:** `/shed` (inside the Garden Hub tab strip)
**Source file:** `src/components/TheShed.tsx`

---

## Quick Summary

A grid of plant cards. Each card represents one `plants` row (a species/type, not an individual instance). Cards show common name, scientific name, source badge (Perenual / Verdantly / AI / Manual), planted count chip, and a row of action buttons (View on Layout, Sun Tracker, Ask AI, Archive, Delete). At the top: a sticky search bar, multi-select toggle, smart filter chips (unassigned / in-plan / harvest-ready), and Add Plant button.

---

## Role 1 — Technical Reference

### Component graph

```
TheShed
├── Header
│   ├── "The Shed" title + plant count badge
│   ├── Background sync loader (when refreshing)
│   ├── Select multi-select toggle
│   ├── Layout button → /garden-layout
│   └── Add Plant button → opens BulkSearchModal
├── Sticky search bar
│   ├── Search input (debounced)
│   ├── Clear button
│   └── Smart filter chips (unassigned / harvest-ready / has ailments / in-plan)
├── AssistantCard ("AI · Your shed")
├── Plant grid (responsive: 1/2/3/4 cols)
│   └── PlantCard ×N
│       ├── Image (SmartImage with fallback)
│       ├── MultiImageGallery overlay
│       ├── Source badge (Perenual / Verdantly / AI / Manual)
│       ├── Action buttons (top right)
│       │   ├── Layout (LayoutGrid icon)
│       │   ├── Sun Tracker (Sun icon)
│       │   ├── Ask AI (Sparkles, Sage/Evergreen only)
│       │   ├── Archive/Restore
│       │   └── Delete (perm-gated)
│       ├── Common name + scientific name
│       ├── Contextual status chips:
│       │   ├── Harvest ready
│       │   ├── X overdue task(s)
│       │   ├── X due today
│       │   ├── X ailment(s)
│       │   ├── Matches your taste (preference match)
│       └── Tap to open PlantEditModal
├── Multi-select bottom action bar (when selectMode)
│   ├── Bulk archive / restore
│   ├── Bulk delete
│   └── Cancel
├── BulkSearchModal (when Add Plant is open)
├── PlantSourcePicker (companion plants flow)
├── PlantEditModal (when tapping a card)
├── PlantAssignmentModal (when assigning a plant to area)
└── Various confirm modals (delete / archive)
```

### State (high-level)

| State | Purpose |
|-------|---------|
| `plants` | All `plants` rows for the home (via `useCachedShed`) |
| `selectedPlants` | Multi-select set |
| `selectMode` | Whether multi-select bar is visible |
| `searchQuery` | Filter input |
| `filters` | Smart filter chips (unassigned/etc.) |
| `showBulkSearch` | BulkSearchModal open |
| `selectedPlant` | PlantEditModal target |
| `bulkQueue` | Active bulk-add operations |
| `plantTaskStatus` | Map of plant id → task status summary |
| `isBackgroundSyncing` | Visual indicator |

### Data flow — read paths

#### `useCachedShed(homeId)` hook

- Reads `plants` table with `home_id = X`
- Cached in localStorage for fast first paint
- Realtime subscription on `plants` table refreshes in-memory state
- Also fetches instance counts via:
  ```ts
  supabase.from("inventory_items")
    .select("plant_id, status")
    .eq("home_id", homeId);
  ```
  And rolls them up into per-plant `instance_count`.

#### Plant task status (per plant)

For each plant, asynchronously computes:
- Overdue task count (related to any inventory_item of this plant)
- Due-today task count
- Active ailment count
- Harvest readiness (any inventory_item with `expected_harvest_date <= today`)

These power the contextual status chips on each card.

### Data flow — write paths

#### Add Plant (via BulkSearchModal)

Multi-step:
1. User searches plants in BulkSearchModal (Perenual / Verdantly / AI sources, depending on tier).
2. Selects one or more results.
3. For each selected:
   - Fetch full details via `getProviderPlantDetails`.
   - Image proxied via `image-proxy` edge fn to keep image URLs stable.
   - Insert into `plants` table with `source: "api" | "verdantly" | "ai" | "manual"`.

#### Archive / Restore

```ts
supabase.from("plants")
  .update({ is_archived: true })
  .eq("id", plant.id);
```

Realtime triggers re-render.

#### Delete

```ts
supabase.from("plants")
  .delete()
  .eq("id", plant.id);
```

Cascades to `inventory_items` and dependent rows via FK ON DELETE CASCADE.

#### Multi-select bulk actions

Same as singular but iterating the selectedPlants set.

#### Assign to area (PlantAssignmentModal)

Inserts new `inventory_items` row with `plant_id`, `home_id`, `area_id`, `status`, etc. May also create smart schedules (blueprints) if AI suggests them.

#### Ask AI (Sparkles button)

Calls `usePlantDoctor().setIsOpen(true)` with `setPageContext({ action: "Asking about a plant in the Shed", plant: {...} })`. Opens Plant Doctor chat with this plant's context loaded.

### Edge functions invoked

| Function | When | Input | Output |
|----------|------|-------|--------|
| `image-proxy` | When adding a plant with an external image URL | `{ imageUrl, plantName }` | `{ publicUrl }` — stable copy in Supabase Storage |
| `verdantly-search` | When searching via Verdantly | search query | Verdantly result array |
| `perenual-proxy` | When searching via Perenual | search query | Perenual result array |
| `search-plants-ai` | When using AI search | `{ query, homeId }` | List of plant names |
| `companion-planting` | When viewing companion suggestions | `{ plantName }` | Companion plant list |
| `smart-plant-scheduler` | When auto-creating schedules on plant assignment | `{ plantId, areaId }` | Suggested blueprint set |

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `update-plant-states` | Daily — advances growth states; affects harvest-ready chip |
| `purge-stale-species-cache` | Periodic — removes stale Perenual cache to limit storage |
| `pattern-scan` + `pattern-evaluate` | Feeds AssistantCard insights for this surface |

### Realtime channels

`plants` and `inventory_items` filtered by `home_id`. Any change triggers shed refresh.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | Add Plant flow only allows Manual entries — Perenual / Verdantly / AI sources gated. Plant Doctor "Ask AI" button hidden. |
| Botanist | Perenual + Verdantly available; AI search + Ask AI gated. |
| Sage | Full Add Plant flow (Perenual + Verdantly + AI). Ask AI works. AssistantCard renders. |
| Evergreen | Same as Sage. |

### Beta gating

None on TheShed surface itself; BetaFeedbackBanner sits at the global header.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `shed.add` | Add Plant button + bulk add flow |
| `shed.delete` | Archive + Delete buttons + bulk archive/delete bar |

If lacking permissions, the buttons are hidden.

### Error states

| State | Result |
|-------|--------|
| Shed fetch fails | "Could not refresh — showing cached data" banner with Retry |
| Bulk add fails partway | Bulk queue shows per-plant success/fail; user can dismiss |
| Image proxy fails | Plant added with default image; non-blocking |
| Plant doctor chat unavailable (tier) | Sparkles button hidden |

### Performance notes

- `useCachedShed` provides instant first paint from localStorage.
- Plant card images use `loading="lazy"` + `decoding="async"`.
- Multi-select uses a Set for O(1) lookups.
- Grid uses CSS grid with no virtualisation (assumes < 200 plants).
- Search is in-memory debounced filter on the cached plants array.

### Linked storage buckets

- `plant-images` — proxied plant images
- `plant-sprites` — visualiser sprites (set via SpriteWizardModal)

---

## Role 2 — Expert Gardener's Guide

### Why open The Shed

The Shed is your plant library — the master list of every species you've added to your garden, whether you've planted it yet or not. Beginners use it as "what have I bought?" — a quick reference for plants picked up at the garden centre. Experienced gardeners use it as a living catalogue plus the launchpad for the most common actions: assign plants to areas, see who's overdue for watering, check who's ready to harvest, ask the AI about a specific plant.

The card-grid layout lets you scan visually. The status chips at the bottom of each card are the working signal — they tell you which plants need attention today vs which are quiet.

### Every flow on this view

#### 1. Add a new plant

- Tap **Add Plant** (top right) → BulkSearchModal opens.
- Search by common or scientific name. Up to three sources (depending on tier) return candidate matches.
- Pick one or many → review → confirm → plants land in your Shed.
- Add Plant has a **"Paste a list"** mode for bulk adding (e.g. you've got a list of 30 species you want to import).

#### 2. Multi-select bulk actions

- Tap **Select** at top → checkboxes appear on each card.
- Tap plants to add to selection.
- Bottom action bar offers Bulk Archive / Bulk Restore / Bulk Delete.

#### 3. Tap a plant card

- Opens PlantEditModal with all plant detail tabs (Schedule, Light, Guides, Companion Plants, etc.) and an at-a-glance strip showing planted count, due tasks, ailments, lux, and a "Find a spot" CTA linking to Sun Tracker.

#### 4. Use the contextual chips

Each card shows up to four chips:
- **Harvest ready**: at least one instance has `expected_harvest_date <= today`.
- **N overdue**: N pending tasks past their due date for this plant.
- **N due today**: tasks due today.
- **N ailment(s)**: active `plant_instance_ailments` rows.
- **Matches your taste**: this plant scored high against your quiz preferences.

#### 5. Use the per-card action buttons (top right of each card)

- **Layout** (grid icon): jumps to Garden Layout so you can place this plant.
- **Sun Tracker** (sun icon): saves the plant context to sessionStorage, jumps to Sun Tracker so you can find a spot matching its sun needs.
- **Ask AI** (sparkles): opens Plant Doctor chat scoped to this plant.
- **Archive** (box icon): hides the plant from active view without deleting.
- **Delete** (trash): permanent removal — confirms first.

#### 6. Smart filter chips

- "Unassigned": plants with no `inventory_items` row (added but never planted).
- "In a plan": plants referenced by a `plans.ai_blueprint.plant_manifest`.
- "Harvest ready": instances ready to pick.
- "Has ailments": plants with active ailments.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Common name | Free text — what you call it |
| Scientific name | Latin binomial (italic) |
| Source badge | Where the species data came from — Perenual / Verdantly / AI / Manual |
| Planted count chip | How many `inventory_items` rows exist for this plant |
| Status chips | See above |
| Background sync loader | Top-bar spinner showing the shed is refreshing in background |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Add Plant offers Manual only. No AI search. No Ask AI buttons. AssistantCard hidden. |
| Botanist | Add Plant offers Perenual + Verdantly + Manual. No AI. |
| Sage | Full Add Plant + Ask AI + AssistantCard. |
| Evergreen | Same as Sage. |

### New user vs returning user vs power user

- **Brand new user**: empty grid with a hint to add their first plant. Add Plant button is the only action that matters.
- **Returning user (a few plants)**: small grid; status chips do most of the navigation.
- **Power user (50+ plants)**: search becomes critical. Smart filters narrow the view. Multi-select is the way to manage drift.

### Beta user experience

The BetaFeedbackBanner sits above the page (global), not Shed-specific.

### Common mistakes / pitfalls

- **Confusing the plant (species) with the inventory item (instance).** The Shed shows species. A single plant card may represent 5 instances planted across your garden — the planted-count chip tells you how many.
- **Archiving when you meant to delete (or vice versa).** Archive keeps the plant in your data but hides it. Delete is permanent and cascades to instances.
- **Forgetting to assign after adding.** A plant in The Shed isn't planted yet. Use the assignment modal or the Layout button to place it.
- **Source badge confusion.** All four sources produce equivalent plants from the app's perspective — the badge just tells you where the data came from for transparency.

### Recommended workflows

- **Add a new plant from a garden-centre haul:** Add Plant → search → pick → assign to an area.
- **End-of-season review:** Filter by "harvest ready" → harvest and archive (or delete if you're done with that variety).
- **Find a spot for a new plant:** open the plant card → tap Sun Tracker button → see where it'll thrive.
- **Quick AI consult:** tap the Sparkles button on a plant card → ask the doctor about it.

### What to do if something looks wrong

- **Plant count badge wrong:** pull-to-refresh. If still wrong, the `inventory_items.plant_id` may be missing — check via the InstanceEditModal.
- **Image is broken:** the image-proxy may have failed at add-time. Open the plant card → re-pick image via the wiki picker.
- **Ask AI button missing:** confirm you're on Sage or Evergreen tier.

---

## Related reference files

- [Watchlist](./02-watchlist.md)
- [Location Manager](./03-location-manager.md)
- [Area Details](./04-area-details.md)
- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md)
- [Plant Assignment Modal](../08-modals-and-overlays/07-plant-assignment-modal.md)
- [Bulk Search Modal](../08-modals-and-overlays/04-bulk-search-modal.md)
- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md)
- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [Data Model — Plants (cross-cutting)](../99-cross-cutting/03-data-model-plants.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/TheShed.tsx` — entire component
- `src/hooks/useCachedShed.ts` — caching hook
- `src/lib/plantProvider.ts` — unified search + details
- `src/lib/perenualService.ts` / `verdantlyService.ts` — provider clients
- `supabase/functions/image-proxy/index.ts` — image stabilisation
- `supabase/functions/companion-planting/index.ts` — companion suggestions
- `supabase/functions/smart-plant-scheduler/index.ts` — auto-blueprint creation
