# The Shed

> The plant inventory — everything you've added to your garden, whether planted yet or not. The main entry point for adding new plants, archiving old ones, and assigning plants to areas.

**Route:** `/shed` (inside the Garden Hub tab strip)
**Source file:** `src/components/TheShed.tsx`

---

## Quick Summary

A grid of plant cards. Each card represents one `plants` row (a species/type, not an individual instance). Cards show the plant photo — or, when `thumbnail_url` is empty, a genus-tinted **initial tile** (`PlantInitialTile`; same genus → same tint) — common name, scientific name, a source badge with a small Lucide icon (Perenual / Verdantly / Library / AI / Manual), Lucide-icon status chips, the instances count, a favourite heart, a **kebab overflow menu** (View on layout / Light needs / Ask Rhozly AI / Archive–Restore / Delete), and the Assign button.

The header (landing chrome diet **Stage 3**, then Nursery promotion **Stage 4** — 2026-07-21) is the shared **HubHeader**: a small "Plants" title + muted count + one persona guidance line + a ⋯ overflow menu (Select plants / Garden layout / Add a whole list), then a **sticky search launcher** ("Search plants…", `shed-add-plant-btn` — a button that opens the full-screen search overlay) beside a **Filters** button with a live count badge (opens a bottom sheet, `shed-filters-panel`). Below: ONE chip row (Active · Favourites · Archived + clearable applied-filter chips). The landing no longer text-filters the grid — one search lives in the overlay, where your own plants surface first.

**Bulk add (Sprint 4a 2026-06-15; CSV upload RHO-4 Phase 1 2026-07-03):** the [`BulkPastePlantsModal`](../../../src/components/BulkPastePlantsModal.tsx) (header button `shed-bulk-paste-btn`, labelled **"Bulk add"** — icon-only below the `sm` breakpoint so it stays visible on a phone) has a **mode toggle**:

- **"Paste a list"** (unchanged) — a multi-line text paste, one plant per line. Sage+ users get a Gemini-backed fuzzy parser ([`parse-plant-list`](../../../supabase/functions/parse-plant-list/index.ts)); free / Botanist users get the regex fallback in [`src/lib/parsePlantList.ts`](../../../src/lib/parsePlantList.ts).
- **"Upload CSV"** (RHO-4 Phase 1) — a strict CSV parse against `PLANT_TEMPLATE` from the new pure module [`src/lib/uploadTemplates/`](../../../src/lib/uploadTemplates/). A **"Download template"** button emits `rhozly-plants-template.csv` (UTF-8 BOM + canonical header row + one EXAMPLE row the parser skips on re-upload). The parser handles RFC-4180 quoting, CRLF/LF, BOM, delimiter sniffing on the header row (`,` / `;` / tab), enum normalisation, per-row + per-field validation (required, enum, int-range, watering min≤max cross-check), a **200-row cap**, and formula-injection hardening. The CSV path is **deterministic and tier-free** (no Gemini call, no `ai_enabled` gate) so it works identically on Sprout.

Both modes feed the **same review step**, which surfaces per-row + per-field errors (invalid rows show a red banner and are excluded from Save), a per-row **favourite** checkbox, and a **"Mark all as favourites"** toggle. Each row is saved via the standard `saveToShed` path as `source: "manual"` (no lookup/dedup — user's own data stays editable); for rows whose favourite flag is set, `favouritePlant()` is called on the new row after insert (manual source → the server tier-trigger always allows it, no AI/API spend). The single field-registry drives the template download, the parser, per-field validation, AND (via a parity unit test) the manual form's payload shape, so template and form can never drift.

The Nursery lives in the **Seed box sheet** since Hub v3 Stage D (2026-07-22) — see [The Nursery](./10-nursery.md) and the Seed box section below; seedlings still graduate back into the Shed via the Plant Out flow.

The **Favourites chip** on the single chip row (Stage 3 — was a Home | Favourites scope pill) switches between the shared home-scoped grid and the user's personal, **cross-home favourites** list (Cross-Home Favourites Phase 1, 2026-07-03). "Home" is today's data unchanged; "Favourites" starts empty and follows the *user* (keyed on `user_id`, not `home_id`) so it survives home switches and leaving/joining homes. Deep link: **`/shed?scope=favourites`** — a new param; the existing GardenHub `?tab=` / `?open=` / `?query=` params are untouched. **Favourites act (overhaul Stage 4, 2026-07-21):** each not-in-home favourite card now leads with **"Add & assign…"** (`favourite-add-assign-{id}`) — copies the favourite into this home via the existing `addFavouritePlantToHome` and immediately opens the full `PlantAssignmentModal` on the fresh row (areas → quantities → smart schedules), jumping the scope back to Home so the plant is visible behind the flow. The copy-only add is the compact secondary (`favourite-add-to-home-{id}`, icon button — testid unchanged). Two repairs shipped with it: **bulk assign now calls `AutomationEngine.applyPlantedAutomations`** (parity with single assign — planted bulk assigns previously got no recurring blueprints; the insert select gained `home_id` which the engine reads), and the source filter gained a **Verdantly** option (verdantly plants were only visible under All Sources). See [Cross-Home Favourites (data model)](../99-cross-cutting/03-data-model-plants.md#cross-home-favourites--user_favourite_plants) and [Tier Gating § source × tier action matrix](../99-cross-cutting/17-tier-gating.md#source--tier-action-matrix--cross-home-favourites).

---

## Role 1 — Technical Reference

### Component graph

```
TheShed
├── HubHeader (src/components/garden/HubHeader.tsx — the SHARED per-tab header,
│   landing chrome diet Stage 3, 2026-07-21: 26 controls above the search → 7)
│   ├── Title row — "Plants" text-xl + muted count + one persona guidance line
│   │     (new/null only) + ⋯ overflow (shed-overflow-menu) holding:
│   │     Select plants (shed-select-mode-btn) · Garden layout
│   │     (shed-open-layout-btn) · Add a whole list (shed-bulk-paste-btn,
│   │     can("shed.add")) → BulkPastePlantsModal
│   └── Sticky search row (opaque — GardenHub's tab bar keeps the one blur)
│       ├── LAUNCHER "Search plants…" (shed-add-plant-btn + Shepherd anchor +
│       │     aria-label "Search your saved plants") — a BUTTON styled as a
│       │     field; tap → the PlantSearchTakeover overlay. The old landing
│       │     grid-filter died (one search): owned matches render INSIDE the
│       │     takeover ("In your Shed" section) above library results
│       └── Filters button (shed-filters-btn + count badge; home scope only)
├── Background-sync loader (the Plants|Nursery toggle died in Stage 4 — the Nursery is the hub's own garden-hub-tab-nursery tab)
├── Fetch-error banner ("Could not refresh — showing cached data")
├── ONE chip row (shed-scope-toggle, role=tablist) — Hub v3 Stage C: the
│   PRESENCE axis, derived from the plant_presence view, never toggled
│   ├── All·n (shed-scope-home) · Active·n (shed-chip-active) · Inactive·n
│   │     (shed-chip-inactive) · Saved·n (shed-chip-saved) · ♥ Mine·n
│   │     (shed-scope-favourites). Saved = curated (is_archived=false) with
│   │     no presence; curated-out + zero-presence rows are search-only.
│   │     LEGACY fallback: localStorage rhozly_legacy_shed_filters=on restores
│   │     the old Active/Favourites/Archived axis (same testids)
│   └── Applied-filter × chips (shed-applied-source / shed-applied-smart)
├── Filters bottom sheet (portal z-[70]; shed-filters-panel testid kept)
│   ├── Source select (aria-label "Filter by source") · Sort select
│   ├── Smart-filter chips (shed-smart-filters → shed-filter-*)
│   └── Clear all + "Done — N plants" (shed-filters-done)
├── AssistantCard ("AI · Your shed")
├── Plant grid (responsive: 1/2/3/4 cols)
│   └── PlantCard ×N (root NOT overflow-hidden — the kebab menu must overflow the card)
│       ├── Image block (h-44, rounds its own top)
│       │   ├── SmartImage (when thumbnail_url) — lazy + async
│       │   ├── PlantInitialTile (when no thumbnail_url — genus-tinted initial, plant-initial-tile)
│       │   ├── MultiImageGallery overlay
│       │   └── Bottom-left column: UpdatedChip (AI freshness) + source badge
│       │       (Perenual / Verdantly / Library / AI / Manual, each with a Lucide icon)
│       ├── Common name + scientific name (+ "Matches your taste")
│       ├── Contextual status chips (Lucide icon + status-token families):
│       │   ├── X ailment(s) — ShieldAlert, watch family
│       │   ├── Harvest ready — Wheat, weather family
│       │   ├── X overdue — Clock, danger family
│       │   └── X due today — sensor family (label only)
│       ├── Actions row (plant-card-actions-{id})
│       │   ├── Favourite heart (favourite-plant-{id} — gating/testid/aria unchanged)
│       │   └── Kebab (plant-card-kebab-{id}, aria-haspopup="menu" + aria-expanded)
│       │       └── Menu (plant-card-menu-{id}, role="menu")
│       │           ├── View on layout (plant-card-layout-{id})
│       │           ├── Light needs (plant-card-light-{id} → plant's Light tab)
│       │           ├── Ask Rhozly AI (plant-card-ask-ai-{id}, aiEnabled only — hidden otherwise)
│       │           ├── Archive / Restore (can("shed.delete") only — hidden otherwise)
│       │           └── Delete (can("shed.delete") only, danger-toned)
│       ├── Instances footer + Assign button (unchanged)
│       └── Tap card body to open PlantEditModal
├── Multi-select bottom action bar (when selectMode)
│   ├── Bulk archive / restore
│   ├── Bulk delete
│   └── Cancel
├── PlantSearchTakeover (when search is open — a FIXED z-[60] OVERLAY covering
│     the app header / weather bar / hub tabs; the grid stays MOUNTED under it,
│     so scroll + tour anchors survive. Input pinned in the top bar (~y=60,
│     keyboard-safe). Hub search-first overhaul Stage 1, 2026-07-21)
├── PlantSourcePicker (companion plants flow)
├── PlantEditModal (when tapping a card)
├── PlantAssignmentModal (when assigning a plant to area)
└── Various confirm modals (delete / archive)
```

### State (high-level)

| State | Purpose |
|-------|---------|
| `plants` | All `plants` rows for the home (via `useCachedShed`) |
| `selectedPlantIds` | Multi-select set |
| `selectMode` | Whether multi-select bar is visible |
| `searchQuery` | Filter input |
| `filterSource` / `sortMode` / `smartFilter` | The three controls inside the Filters panel (source select, sort select, smart chips). `activeFilterCount` is derived from them — each non-default value counts one, driving the badge on the Filters button |
| `filtersOpen` | Filters disclosure panel open/closed (Phase 4.3) |
| `openMenuPlantId` | Which card's kebab menu is open (`null` = none; only one at a time) |
| `showBulkSearch` | The PlantSearchTakeover overlay open (fixed z-[60] over all chrome; the grid stays mounted underneath — was an early-return page pre-Stage-1 of the search-first overhaul, and BulkSearchModal before that) |
| `editingPlant` / `editingPlantTab` | PlantEditModal target + the tab it opens on (`"care"` default; `"light"` from the kebab's Light needs item) |
| `selectedPlant` | PlantAssignmentModal target (the Assign button) |
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

#### Add Plant (via the full-page PlantSearchTakeover — Stage 2, 2026-07-21)

> The Shed's add flow is a **page, not a modal**: `src/components/shed/PlantSearchTakeover.tsx` extracts BulkSearchModal's machinery (cart shapes, `preloadedDetails` no-Gemini library path, paste-a-list, Search|Manual tabs with the SAME `bulk-search-tab-*` testids the manual-add tour anchors, `bulk-search-review`/`bulk-search-start-import`, the AI page-context lifecycle, `initialCartItems`→review for the `state.autoImport` flows) into a full-width column with a sticky cart tray. Escape closes it (review→search first; never on the Manual form; never under the PlantDetailModal). Grid scroll restores on close. All deep links (`?open=add-plant&query=`, `/shed/add/*`, `state.returnTo`) are unchanged. **BulkSearchModal lives on solely as CompanionPlantsTab's host.**

Multi-step:
1. User searches plants in the takeover (library-first shared `<PlantSearch>`; Perenual / Verdantly / AI opt-in by tier).
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

When a plant has **no** instances, a simple confirm → `plants.delete()`:

```ts
supabase.from("plants")
  .delete()
  .eq("id", plant.id);
```

Cascades to `inventory_items` and dependent rows via FK ON DELETE CASCADE.

When the plant **has instances** (`inventoryCount > 0`), the dialog (`DeleteWithInstancesModal`) offers two outcomes instead of a single confirm:
- **Keep the history** (`executeEndOfLifeInstead`) — mark every still-active instance End of Life (`inventory_items.ended_at = now`, `was_natural_end = null`, `end_summary`, `status = "Archived"`), journal a closing entry per instance, then **archive the plant** (`plants.is_archived = true`). Nothing is deleted; the instances appear in Senescence and the whole thing is restorable. Chosen because the FK cascade means the plant can't be deleted without losing the instances.
- **Delete everything** (`executeDelete`) — `plants.delete()` (cascades instances/tasks/journals) + `task_blueprints` cleanup.

#### Multi-select bulk actions

Same as singular but iterating the selectedPlants set.

#### Assign to area (PlantAssignmentModal)

Inserts new `inventory_items` row with `plant_id`, `home_id`, `area_id`, `status`, etc. May also create smart schedules (blueprints) if AI suggests them.

#### Ask Rhozly AI (kebab menu item)

Calls `usePlantDoctor().setIsOpen(true)` with `setPageContext({ action: "Asking about a plant in the Shed", plant: {...} })`. Opens Plant Doctor chat with this plant's context loaded. Lives in the card's kebab menu since Phase 4.3 (`plant-card-ask-ai-{id}`); aria-label unchanged (`Ask Rhozly AI about {name}`).

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
| `refresh-stale-ai-plants` | Daily — re-checks global AI care guides every ~90 days. When a global plant's `freshness_version` advances ahead of a user's `user_plant_ack.seen_freshness_version`, the AI **Updated chip** appears on that card. Added in Wave 4 + Wave 5 of AI Plant Overhaul. |

### AI freshness chip

The bottom-left of each plant card carries a small yellow chip (`data-testid="ai-updated-chip"`) when:

1. The card's plant has `source = "ai"`, AND
2. The global catalogue row's `freshness_version` is ahead of the user's most recent `user_plant_ack.seen_freshness_version`.

User-facing copy never mentions "catalogue", "fork" or "linked" — internally these terms drive the data model, but the user just sees an **"AI"** chip on auto-updating plants and an **"AI · Edited"** chip on plants they've customised. See [Plant Edit Modal § AI editing flow](../08-modals-and-overlays/06-plant-edit-modal.md#ai-editing-flow) for the full UX.

For home-scoped rows added via the bulk-add or PlantSearchModal flow (`forked_from_plant_id` set), the freshness state resolves via the global parent — so the chip lights when the global gets updated, not when the home row's data drifts. Edited rows (`overridden_fields.length > 0`) never show the chip; they've opted out of auto-updates. Orphan rows (`source='ai'` + `home_id != null` + `forked_from_plant_id IS NULL`) also don't show the chip — they self-heal on Refresh click inside Plant Edit Modal.

Tapping the chip opens the plant in Plant Edit Modal, where the full `<CareUpdateCallout>` lists the changed fields and offers "Mark as reviewed". The chip is driven by `useAiPlantFreshness` in [`src/hooks/useAiPlantFreshness.ts`](../../../src/hooks/useAiPlantFreshness.ts).

### Cross-home favourites (Phase 1 — plants)

Scope pills **Home | Favourites** (`data-testid="shed-scope-toggle"`, buttons `shed-scope-home` / `shed-scope-favourites`). State derives from `?scope=favourites`; `switchScope` does a targeted `setSearchParams` get/set (never `setParams({})`) so it never clobbers `?tab=` etc.

- **Favourite affordance (Home tab):** a heart button on each `PlantCard` (`data-testid="favourite-plant-<id>"`, `aria-pressed` reflects saved state). Fill is driven by `favouriteRefIds` — a Set of the **canonical reference ids** of the user's favourites. `handleToggleFavourite` optimistically inserts/removes via `favouritesService`. Identity = `canonicalPlantRefId(plant)` in [`src/lib/favouriteIdentity.ts`](../../../src/lib/favouriteIdentity.ts): the **global catalogue id** for AI/library forks (`forked_from_plant_id`), the row's own id otherwise. Because copy-on-write keeps referenced rows immutable, favourites need **no dedupe machinery** — a `UNIQUE (user_id, plant_id)` upsert suffices (re-favouriting refreshes the tombstone).
- **Favourites tab:** `<FavouritePlantsGrid>` ([`src/components/favourites/FavouritePlantsGrid.tsx`](../../../src/components/favourites/FavouritePlantsGrid.tsx)) lists the user's favourites with the live joined `plants` row ("always live"); when the reference is gone (`plant_id` NULL after `ON DELETE SET NULL`) it renders from the jsonb `snapshot` **tombstone** with an "Original removed — saved copy" chip. Actions: **Add to this home** (`favourite-add-to-home-<id>`) and **Remove** (`favourite-remove-<id>`); a first-visit **hint banner** (`favourites-hint-banner`) and an empty state. Home-scope-only chrome (Select, Find a plant, Bulk add, AssistantCard, the Filters button + panel, Active/Archived) is hidden in Favourites.
- **Add to this home:** `addFavouritePlantToHome` copies the favourite into the active home via the **existing `saveToShed` insert path** — zero AI/API calls, **allowed for any home member regardless of permission keys** (favouriting is personal; add-to-home is a plain member write). AI/library favourites are copied as the classic shallow fork (`source='ai'`, `forked_from_plant_id` = global id, empty overrides) + seed `user_plant_ack`. The button reads **"In this home"** (`favourite-in-home-<id>`, disabled) when `isFavouriteInHome` finds a home row that is or forks-from the reference.
- **Copy-on-write plant edits (2026-07-03):** editing ANY **non-manual** plant (api / verdantly / ai / library) does **not** mutate the row — `PlantEditModal` presents "Save as my own copy" and calls `onForkSave` → `handleForkPlant` → `forkPlantForHomeEdit`: insert a NEW `source='manual'` row (provenance via `forked_from_plant_id`), **re-point** the home's `inventory_items` / `plant_schedules` / `seed_packets` / `plant_sprites` / `automations` from the original to the fork, then **delete** the original home row. Manual plants still edit in place. This keeps favourite references stable forever ("always live" is safe) and is why favourites carry only a tombstone snapshot. See [Data Model — Plants § copy-on-write](../99-cross-cutting/03-data-model-plants.md#copy-on-write-plant-edits-2026-07-03).
- **Strict source × tier gating:** sources above the viewer's entitlements are **view-only** — the heart AND add-to-home are disabled with an upsell tooltip, enforced **client-side** (`isSourceLockedForTier`) AND **server-side** (a `BEFORE INSERT/UPDATE` trigger `enforce_favourite_plant_tier` on `user_favourite_plants` re-derives the source from the referenced `plants` row and compares `ai_enabled` / `enable_perenual`). See [Tier Gating § source × tier action matrix](../99-cross-cutting/17-tier-gating.md#source--tier-action-matrix--cross-home-favourites).
- **Service:** [`src/services/favouritesService.ts`](../../../src/services/favouritesService.ts) — all reads are `user_id`-only (never `home_id`, which would silently return nothing under the user-scoped RLS). Events: `PLANT_FAVOURITED` / `PLANT_UNFAVOURITED` / `FAVOURITE_ADDED_TO_HOME` / `PLANT_FORKED_ON_EDIT`.

### Realtime channels

`plants` and `inventory_items` filtered by `home_id`. Any change triggers shed refresh. **Favourites** are not on a realtime channel (per-user data, mutated only by the same client) — the list refetches on mount and after each mutation.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | Add Plant flow only allows Manual entries — Perenual / Verdantly / AI sources gated. The "Ask Rhozly AI" kebab menu item is hidden. |
| Botanist | Perenual + Verdantly available; AI search + Ask Rhozly AI gated. |
| Sage | Full Add Plant flow (Perenual + Verdantly + AI). "Ask Rhozly AI" appears in the card kebab. AssistantCard renders. |
| Evergreen | Same as Sage. |

Phase 4.3 moved the tier-gated action into the kebab menu but preserved the gating **semantics**: "Ask Rhozly AI" is *hidden* (not disabled) below Sage, exactly as its standalone Sparkles button was. The favourite heart keeps its separate disabled-with-tooltip source × tier gate (see Cross-home favourites above).

### Beta gating

None on TheShed surface itself; BetaFeedbackBanner sits at the global header.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `shed.add` | "Find a plant" button + bulk add flow |
| `shed.delete` | Archive/Restore + Delete items in the card kebab menu + bulk archive/delete bar |

If lacking permissions, the controls are hidden — the kebab menu simply omits the Archive/Restore and Delete items rather than greying them out (the same hidden-vs-disabled semantics as the pre-4.3 standalone buttons).

**Favourites are ungated by permission keys:** favouriting/unfavouriting is personal (no `PermissionKey`), and **Add to this home** is allowed for any home member regardless of `shed.add` (it's a member write, not an admin action — 2026-07-03 decision). Only the source × tier gate can block a favourite action.

### Error states

| State | Result |
|-------|--------|
| Shed fetch fails | "Could not refresh — showing cached data" banner with Retry |
| Bulk add fails partway | Bulk queue shows per-plant success/fail; user can dismiss |
| Image proxy fails / plant has no image | Plant saved without a `thumbnail_url`; the card renders the genus-tinted `PlantInitialTile` (`plant-initial-tile`) instead — non-blocking. The old shared Unsplash forest-photo fallback is gone (also removed from PlantVisualiser and FavouritePlantsGrid) |
| Plant doctor chat unavailable (tier) | "Ask Rhozly AI" kebab menu item hidden |

### Performance notes

- `useCachedShed` provides instant first paint from localStorage.
- Plant card images use `loading="lazy"` + `decoding="async"` (applies when a `thumbnail_url` exists; the no-photo `PlantInitialTile` is pure CSS — a deterministic hash → tint via `plantPlaceholder.ts`, zero network requests).
- Multi-select uses a Set for O(1) lookups.
- Plant cards enter with a staggered cascade (`staggerStyle(index)` + `STAGGER_ENTRANCE` from `src/lib/stagger.ts` — capped 6 × 40ms, compositor-only, zeroed under reduced motion). Cards are keyed by plant id, so the entrance fires on mount only — filtering does not replay it. Both survived the Phase 4.3 card redesign unchanged. See [Design System](../99-cross-cutting/40-design-system.md).
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

- Tap **Find a plant** (top right) → the page becomes a full-screen search — room to breathe on a phone, no porthole. Pick as many as you like; the tray at the bottom collects them; Review & Add imports the lot. Your Shed (with your scroll position) returns when you're done.
- Search by common or scientific name. Up to three sources (depending on tier) return candidate matches.
- Pick one or many → review → confirm → plants land in your Shed.
- The **"Bulk add"** button (next to Find a plant) is for adding many plants at once. It offers two ways in:
  - **Paste a list** — type or paste a plant per line (e.g. you scribbled 30 plants on your phone). Sage+ gets smarter AI parsing; every tier gets a solid regex fallback.
  - **Upload CSV** — for spreadsheet people who want every field. Tap **Download template**, fill one row per plant in Excel/Sheets (only the common name is required; up to 200 rows), and upload it. This path is exact and works on every plan — no AI needed. Tick the **favourite** column (or "Mark all as favourites" on the review screen) to save rows straight to your cross-home Favourites as they import.
  - Both ways land on the same review screen, where you fix or remove any flagged rows before saving. Every plant is added as your own editable **Manual** plant — there's no database lookup, so nothing gets locked or overwritten.

#### 2. Multi-select bulk actions

- Tap **Select** at top → checkboxes appear on each card.
- Tap plants to add to selection.
- Bottom action bar (active view) offers **Assign**, **Archive**, and **Delete**; the archived view offers **Restore**.
  - **Assign** (`BulkAssignModal`) — pick one location/area (or "add to garden, no area"), set a quantity per selected plant, choose Planted/Unplanted, and optionally generate a smart planting schedule per plant (Sage+). `handleBulkAssign` inserts the instances and applies each plant's recommended schedule as tasks.
  - **Delete** (`BulkDeleteModal`) — when any selected plant has instances, offers **Keep the history** (mark the instances End of Life → Senescence and archive every selected plant — `handleBulkEndOfLifeInstead`) vs **Delete everything** (`handleBulkDelete`, cascades). When none have instances, a plain "Delete N plants?" confirm.

#### 3. Tap a plant card

- Opens PlantEditModal with all plant detail tabs (Care Plan, Light, **Soil Needs**, Grow Guide, Community, Companions, Instances) and an at-a-glance strip showing planted count, due tasks, ailments, lux, and a "Find a spot" CTA linking to Sun Tracker. The **Soil Needs** tab (`SensorRequirementsTab`) shows the plant's ideal soil moisture / EC / soil-temperature bands (`plants.soil_*`) with an AI-gated "Generate with AI" action — the same shared tab used by `PlantDetailModal`.

#### 4. Use the contextual chips

Each card shows up to four chips:
- **Harvest ready**: at least one instance has `expected_harvest_date <= today`.
- **N overdue**: N pending tasks past their due date for this plant.
- **N due today**: tasks due today.
- **N ailment(s)**: active `plant_instance_ailments` rows.
- **Matches your taste**: this plant scored high against your quiz preferences.

#### 5. Use the per-card actions (heart + kebab)

Two actions stay front-and-centre on every card: the **favourite heart** (save the plant to your cross-home Favourites — see flow 6) and the **Assign** button in the footer (place it in an area). Everything else lives behind the **⋮ menu** at the right of the actions row — one tap to open, and the card stays clean:

- **View on layout**: jumps to Garden Layout so you can place this plant.
- **Light needs**: opens this plant's edit modal on the **Light** tab — shows the plant's optimal lux range and, via the light reader, how close your current light is to what it needs. (Previously jumped to the Sun Tracker; the Sun Tracker is still reachable from inside the plant modal and from Tools.)
- **Ask Rhozly AI** (Sage/Evergreen): opens Plant Doctor chat scoped to this plant.
- **Archive** / **Restore**: hides the plant from active view without deleting (or brings an archived one back).
- **Delete** (shown in red): confirms first. If the plant has instances, you choose between **Keep the history** (mark them End of Life → Senescence, and archive the plant) or **Delete everything** (permanent, cascades to instances).

If you don't see Ask Rhozly AI, that's a tier thing (Sage+); if Archive and Delete are missing, your household role doesn't include deleting plants. Tap anywhere outside the menu to close it.

#### 6. Favourites — keep plants across every garden you tend

Tap the **Favourites** pill (next to **Home**) to see your personal saved list. Unlike the Home list, which belongs to whichever home you're currently in, favourites follow **you** — switch home, leave a home, join a new one, and they're still there.

- **Save one:** tap the ♡ on any plant card in the Home tab. It fills in, and the plant lands in Favourites. Tap again to remove it.
- **Bring one into this garden:** on the Favourites tab, **Add to this home** creates a fresh copy of that plant in the home you're currently in (no AI or database lookup — instant, and free on every tier). Once it's here the button reads **In this home**. Any household member can do this — you don't need special permissions.
- **Old favourites still work:** if a plant you favourited was later removed or you left that garden, the card still shows what you saved (a "saved copy") so you never lose the reference.
- **Editing a database or AI plant makes your own copy:** the built-in Perenual/Verdantly/AI plants are shared, so when you edit one Rhozly saves it as **your own copy** ("Save as my own copy") and leaves the original untouched — your instances, schedules and seed packets move onto your copy automatically. Plants you typed in yourself edit normally.

#### 7. Filter and sort (the Filters button)

Tap **Filters** at the right of the toolbar to fold out the filtering panel. The button carries a count badge whenever something non-default is active (a source filter, a non-A–Z sort, or a smart chip each count one) — so a "quietly filtered" grid always announces itself. Inside the panel:

- **Source select** ("All Sources / Manual / Plant Database / AI"): narrow to where the plant data came from.
- **Sort select** ("A – Z" or "Best Match", based on your quiz preferences).
- **Smart-filter chips** — All / **Unassigned** / **In a plan**, each with a live count; a chip with nothing to show is disabled:
  - "Unassigned": plants with no `inventory_items` row (added but never planted).
  - "In a plan": plants referenced by a `plans.ai_blueprint.plant_manifest`.

(Harvest-ready and ailment signals are **status chips on the cards**, not filters — scan for them in the grid.)

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Photo / initial tile | The plant's photo when it has one. With no photo, a soft tinted tile shows the plant's initial — the tint is keyed on the **genus** (scientific-name first word; common name as fallback), so a bed of *Solanum* (tomato, potato, aubergine) shares one colour and scans as a family at a glance. Same plant, same tint, forever |
| Common name | Free text — what you call it |
| Scientific name | Latin binomial (italic) |
| Source badge | Where the species data came from — Perenual / Verdantly / Library / AI / Manual, each with a small Lucide icon (the one-time explainer banner above the grid uses Globe/Leaf/Sparkles/Pencil icons too — no emoji anywhere) |
| Planted count chip | How many `inventory_items` rows exist for this plant |
| Status chips | Icon + colour family per signal: shield (amber "watch") for ailments, wheat sheaf for Harvest ready, clock (red "danger") for overdue, and a plain "due today" count. Labels read exactly as before — the emoji prefixes are gone |
| Heading tally | "Your Shed — N species · M plants" — N distinct plant cards, M total instances across them |
| Filters button badge | How many non-default filters are active right now (source + sort + smart chip) |
| Background sync loader | Top-bar spinner showing the shed is refreshing in background |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Add Plant offers Manual only. No AI search. No "Ask Rhozly AI" in the card ⋮ menus. AssistantCard hidden. **Favourites: can favourite/add-to-home only manual plants — the ♡ and "Add to this home" are disabled (view-only) on Perenual/Verdantly/AI plants a housemate added.** |
| Botanist | Add Plant offers Perenual + Verdantly + Manual. No AI. **Favourites: can act on manual + Perenual/Verdantly plants; AI plants view-only.** |
| Sage | Full Add Plant + "Ask Rhozly AI" in every card ⋮ menu + AssistantCard. **Favourites: can act on manual + AI plants; Perenual/Verdantly plants view-only** (Sage has AI, not the species database — tiers are a lattice, not a ladder). |
| Evergreen | Same as Sage, plus the species database. **Favourites: can act on every source.** |

### New user vs returning user vs power user

- **Brand new user**: empty grid with a hint to add their first plant. The Find a plant button is the only action that matters.
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

- **Add a new plant from a garden-centre haul:** Find a plant → search → pick → assign to an area.
- **End-of-season review:** scan the grid for the **Harvest ready** chips → harvest, then archive (or delete) via each card's ⋮ menu.
- **Check a plant's light needs:** open the card's ⋮ menu → **Light needs** → opens the Light tab → see its optimal lux range and how close your current light is. (To find a physical spot, use the Sun Tracker from the plant modal or Tools.)
- **Quick AI consult:** open the card's ⋮ menu → **Ask Rhozly AI** → ask the doctor about it.

### What to do if something looks wrong

- **Plant count badge wrong:** pull-to-refresh. If still wrong, the `inventory_items.plant_id` may be missing — check via the InstanceEditModal.
- **Card shows a coloured letter instead of a photo:** that's not broken — it's the placeholder for a plant with no photo (the image-proxy may have failed at add-time, or none was ever picked). Open the plant card → re-pick an image via the wiki picker and the photo takes over. Until then, same-genus plants deliberately share the same tint so they read as a family.
- **Ask Rhozly AI missing from the ⋮ menu:** confirm you're on Sage or Evergreen tier.

---

## Related reference files

- [Watchlist](./02-watchlist.md)
- [Senescence](./12-senescence.md) — the history of ended plant instances (sibling tab in the Garden Hub strip)
- [Location Manager](./03-location-manager.md)
- [Area Details](./04-area-details.md)
- [Garden Layout Editor](./06-garden-layout-editor.md)
- [Sun Tracker AR](./08-sun-tracker-ar.md)
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md)
- [Plant Assignment Modal](../08-modals-and-overlays/07-plant-assignment-modal.md)
- [Bulk Search Modal](../08-modals-and-overlays/04-bulk-search-modal.md)
- [Lifecycle Complete Modal](../08-modals-and-overlays/37-lifecycle-complete.md) — the end-of-life flow opened from per-instance buttons; destination is the Senescence tab
- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md)
- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [Data Model — Plants (cross-cutting)](../99-cross-cutting/03-data-model-plants.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/TheShed.tsx` — entire component (incl. scope pills, heart, kebab menu, Filters disclosure, copy-on-write fork handler)
- `src/components/ui/PlantInitialTile.tsx` — the genus-tinted no-photo tile (Phase 4.3; replaces the shared Unsplash fallback)
- `src/lib/plantPlaceholder.ts` — pure placeholder helpers: genus key (scientific-name first word, common-name fallback), initial glyph, tint colour
- `src/lib/garden/plantTokens.ts` — `getTokenColorForKey` stable hash → palette colour (shared with garden-layout plant tokens)
- `src/components/favourites/FavouritePlantsGrid.tsx` — Favourites scope body
- `src/services/favouritesService.ts` — favourite/unfavourite, add-to-home, copy-on-write fork+re-point
- `src/lib/favouriteIdentity.ts` — pure identity / gating / fork helpers (unit-tested)
- `supabase/migrations/20260831000000_user_favourite_plants.sql` — table + RLS + grants + tier-gate trigger
- `src/components/BulkPastePlantsModal.tsx` — bulk add modal (paste + CSV modes, shared review step, favourites-on-import)
- `src/lib/uploadTemplates/` — pure CSV upload registry: `types.ts` (FieldSpec / RecordTemplate / RowIssue / ParsedRow), `registry.ts` (`PLANT_TEMPLATE` — Phase 1; AILMENT/SEED_PACKET slot in for Phases 2/3), `csv.ts` (RFC-4180 tokenizer + serialiser, BOM, delimiter sniffing), `parse.ts` (`parseCsv` — per-row/field validation, EXAMPLE skip, 200-row cap), `template.ts` (`buildTemplateCsv` + `downloadTemplate`)
- `tests/unit/lib/uploadTemplates/*.test.ts` — registry↔cleanPayload parity guard + csv/parse/template coverage
- `src/hooks/useCachedShed.ts` — caching hook
- `src/lib/plantProvider.ts` — unified search + details
- `src/lib/perenualService.ts` / `verdantlyService.ts` — provider clients
- `supabase/functions/image-proxy/index.ts` — image stabilisation
- `supabase/functions/companion-planting/index.ts` — companion suggestions
- `supabase/functions/smart-plant-scheduler/index.ts` — auto-blueprint creation

## Remove from garden ↔ blueprints (Hub v3 Stage C, 2026-07-22)

Curating a plant out (archive, single or bulk) now also archives every blueprint whose `inventory_item_ids` is FULLY contained in that plant's instances (cross-plant blueprints untouched); saving it back restores them (`setBlueprintsArchivedForPlants`, best-effort). The DB enforces the reverse invariant: creating an instance or sowing clears `plants.is_archived` (`20261019000000_unarchive_on_presence.sql` — SECURITY DEFINER triggers on inventory_items / seed_sowings / plant_instance_ailments).

## Seed box + two-tab hub (Hub v3 Stage D, 2026-07-22)

The hub is **Plants | Ailments** (ids stay `shed`/`watchlist`; the legacy flag restores four tabs). The Nursery surface lives in the **Seed box** — a full-height sheet (`seed-box-sheet` / `seed-box-close`, portal z-[70]) hosting the entire `NurseryTab` unchanged. Entries: the ⋯ menu (`shed-open-seed-box`), the **Sowings-now strip** (`shed-sowings-now-strip` — renders only when live sowings exist), the Active-chip empty state ("…or sow a seed"), and the `?tab=nursery` redirect (`→ ?open=seed-box`, URL then cleaned). `?tab=senescence[&plant=]` redirects to the Inactive chip (+ opens that plant's modal); the Senescence page is retired — the Inactive chip IS the aggregate.
