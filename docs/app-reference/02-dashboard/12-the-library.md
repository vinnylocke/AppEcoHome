# The Library — **RETIRED**

> **This surface has been removed.** The standalone `/library/*` screens (search, saved, plant preview) were retired in favour of in-context plant search. The `plant_library` database table is **unchanged** and still feeds every plant search in the app.
>
> - **Search any species:** use the **Add Plant** flow in The Shed (`/shed`), the Shopping Add-Item sheet, the Nursery picker, or **Plant Lens** (`/doctor`) — all backed by the shared `<PlantSearch>` component.
> - **Care guide / Grow guide / Companions / Light overlay:** opened by tapping a search result's ⓘ → **See full care** anywhere; the **Seasonal Picks** card also opens the same overlay (`PlantDetailModal`) when you tap a pick.
> - **Save to Shed:** the search-result row's checkbox / Add button.

The body below is preserved for historical reference; the routes and component files it describes no longer exist.

**Route / how to reach it:** ~~`/library/search` / `/library/saved` / `/library/plant/:plantId`~~ — **retired**.
**Source files (entry points):**
- `src/components/library/LibraryHome.tsx`
- `src/components/library/LibrarySearchTab.tsx`
- `src/components/library/LibrarySavedTab.tsx`
- `src/components/library/PlantPreview.tsx`
- `src/lib/plantCatalogue.ts` — shared helper for "ensure global catalogue plant" + "load catalogue plant by id"
- `src/lib/saveToShed.ts` — shared helper extracted from TheShed for save flow

---

## Quick Summary

The Library is the **research counterpart to The Shed**. The Shed lists plants you own; The Library lets you look up any species — across Perenual, Verdantly and Rhozly AI — without committing to it. Tapping a result opens a full preview (Care Guide / Grow Guide / Companions / Light) and the data is persisted to the global catalogue so the next user to search the same plant gets an instant cached read. A Save button adds the plant to your Shed; if it's already there, the button reads "In your Shed".

---

## Role 1 — Technical Reference

### Component graph

```
LibraryHome  (page shell + tab toggle + nested routes)
├── Header (wordmark + sub)
├── Tab toggle  (Search / Saved) — hidden on /library/plant/:id
└── Routes
    ├── /library/search        → LibrarySearchTab
    │   ├── Search input (debounced 350ms)
    │   └── Results list (provider badge, "In your Shed" pill)
    ├── /library/saved         → LibrarySavedTab
    │   └── useCachedShed → filterable list
    └── /library/plant/:id     → PlantPreview
        ├── Sticky header (Back + Save / In your Shed)
        ├── Hero image
        ├── Tab bar (Care Guide / Grow Guide / Companions / Light)
        └── Active tab body (only the active tab is mounted)
            ├── Care Guide   → PlantInfoPanel
            ├── Grow Guide   → GrowGuideTab        (existing component)
            ├── Companions   → CompanionPlantsTab  (existing component)
            └── Light        → LightTab            (existing component)
```

### Props received

**LibraryHome:**

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx (profile.home_id) | Scope for the matcher + Save flow |
| `aiEnabled` | `boolean` | App.tsx (profile.ai_enabled) | Includes AI in search + unlocks Grow Guide tab |
| `isPremium` | `boolean` | App.tsx (profile.enable_perenual) | Threaded to CompanionPlantsTab |

**PlantPreview:** same three plus `:plantId` URL param.

### State (local)

| Component | State | Purpose |
|-----------|-------|---------|
| `LibrarySearchTab` | `query`, `results`, `searching`, `opening`, `error` | Input value, results array, in-flight flags |
| `LibrarySavedTab`  | `filter` | In-memory filter over `useCachedShed`'s plants |
| `PlantPreview` | `plant`, `loading`, `error`, `activeTab`, `saving`, `justSaved` | Loaded catalogue plant + tab + save flow state |

`useShedPlantMatcher(homeId)` is used in both the search tab (for the "In your Shed" pill) and the preview (for the Save button's disabled state). The matcher caches its query on mount; `justSaved` local state on the preview bridges the post-save gap until the user navigates and the hook re-fetches.

### Data flow — read paths

| Trigger | Call | Notes |
|---------|------|-------|
| Search input ≥ 2 chars (350ms debounced) | `searchAllProviders(query, undefined, undefined, { includeAi, homeId })` | Fans out to Perenual + Verdantly + (when AI enabled) AI |
| Tap a search result | `ensureCataloguePlantFromSearchResult(result, { homeId })` → returns `{ plantId, source, details, fromCache }` | Inserts a global `plants` row (`home_id = NULL`) if absent for Perenual/Verdantly; defers to `generate_care_guide` for AI |
| Preview mount | `loadCataloguePlant(plantId)` | Reads `plants.id`; adapts to PlantDetails via `plantRowToPlantDetails` |
| Care Guide tab | none additional — renders `plant.details` directly |
| Grow Guide tab | `plant_grow_guides` lookup; `generate_grow_guide` edge fn action on first generate | Cache-first |
| Companions tab | `supabase.functions.invoke("companion-planting", { ... })` | Same call shape as Shed's Companion tab |
| Light tab | `supabase.from("plants").select("sunlight, source, perenual_id")` | Falls back to provider call when sunlight is empty |
| Saved tab | `useCachedShed(homeId)` | localStorage-cached, realtime-refreshed |

### Data flow — write paths

| Trigger | Call | Notes |
|---------|------|-------|
| Tap result on Search tab | `INSERT INTO plants (home_id = NULL, source, perenual_id|verdantly_id, …)` via `ensureCataloguePlantFromSearchResult` | Only when the row doesn't exist already. Idempotent. |
| Save button on preview | `saveToShed(skeleton, fullCareData, homeId)` — extracted from TheShed | Inserts a home-scoped `plants` row with `home_id = X` + auto-generates seasonal `plant_schedules` rows + a Verdantly harvest-check schedule when applicable |
| Grow Guide first generate | `upsert plant_grow_guides` via the edge fn | Keyed on the catalogue `plant_id` — benefits future researchers |

### Edge functions invoked

| Function | When | Input | Output |
|----------|------|-------|--------|
| `search-plants-ai` | AI provider on search (when `aiEnabled`) | `{ query, homeId }` | matches array |
| `perenual-proxy` | Perenual provider on search | search query | Perenual matches |
| `verdantly-search` | Verdantly provider on search | search query | Verdantly matches |
| `plant-doctor` (`generate_care_guide`) | AI result tapped, when not already in catalogue | `{ targetPlant, homeId }` | care-guide JSON + `db_plant_id` |
| `plant-doctor` (`generate_grow_guide`) | Grow Guide tab first generation | `{ plantId, homeId }` | grow-guide envelope |
| `companion-planting` | Companions tab opened | `{ source, verdantly_id, plant_name, ai_enabled }` | beneficial/harmful/neutral arrays |
| `plant-image-search` | Care Guide image gallery | `{ query, count }` | image URLs |

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `refresh-stale-grow-guides` | Every ~90 days, regenerates cached grow guides. Library users see the most-recent guide on first paint; the cron keeps the cache warm even when nobody has revisited the species recently. |
| `refresh-stale-ai-plants` | Refreshes AI catalogue rows every 90 days — applies to Library hits with `source='ai'` only. |

### Realtime channels

The Saved tab inherits realtime from `useCachedShed` (the same channel The Shed uses). The Search tab does not subscribe.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | Search returns Perenual + Verdantly only (no AI). Grow Guide tab shows the upgrade banner; tap fires a toast. Companions tab falls back to its "AI required" state for non-Perenual hits. |
| Botanist | + Perenual (already on Sprout); Verdantly enabled by default at Sprout. Grow Guide still gated. |
| Sage | + AI search results + Grow Guide tab unlocked. |
| Evergreen | Same as Sage. |

### Beta gating

None on the Library surfaces themselves. The global BetaFeedbackBanner shows above the page when the user is in a beta cohort.

### Permissions / role-based UI

| Permission | Effect |
|------------|--------|
| `shed.add` | Hides the Save button on the preview when the caller lacks `shed.add`. Library is otherwise read-only for unprivileged members of a shared home. |

### Error states

| State | Result |
|-------|--------|
| Search providers all fail | Inline red banner with the underlying message + retry-by-typing |
| Catalogue ensure fails | Toast with the message; user stays on the search list |
| Preview load fails | Full-page error card with "Back to search" CTA |
| Grow Guide / Companions / Light tab fails | Per-tab error UI (handled by the existing components) |
| Save fails | Toast; the button re-enables |

### Performance notes

- Search is debounced 350ms; multi-provider fan-out is `Promise.all` and each provider has its own per-query cache.
- The preview only mounts the active tab; switching tabs unmounts the previous one. Grow Guide and Companions both cache-first.
- `LibrarySavedTab` uses `useCachedShed` which paints from localStorage first.
- The hero image uses `loading="lazy"` + `decoding="async"`.

### Linked storage buckets

- `plant-images` — proxied images shown on the hero and in the gallery.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You're standing in a garden centre with a labeled cutting in your hand. You want to know what this plant needs before you buy it — or how it fits with what you already grow. The Library exists for that moment: type the name, and inside ten seconds you've got a full care guide, a grow guide, a list of companion plants, and the light it needs. Save it to your Shed when you've decided you actually want it.

It's also the right tool for a curious afternoon — when you're not shopping, but you want to dig into a species you've heard about. The Shed shows plants you own; the Library shows what you *could* grow.

### Every flow on this page

#### 1. Search by name (the default tab)

- Type a common name — "tomato", "lavender", "rose bush".
- Results appear from Perenual (global database), Verdantly (curated grower's database), and Rhozly AI (a name-completion fallback for unusual plants).
- Each row carries a provider badge so you know where the data came from. If the plant is already in your Shed, a small "In your Shed" pill appears on the right.
- Tap a row → a brief spinner while the data is fetched, then the preview screen opens.

#### 2. Browse what you've already saved (the Saved tab)

- Tap **Saved**.
- See every plant in your Shed listed compactly, filterable by name.
- Tap one to open the same preview screen — useful if you want to look at the grow guide for a plant you've owned for ages without going through The Shed grid.

#### 3. The preview screen

- **Back** returns you to the search results with your query and scroll position preserved.
- **Save** is the prominent button in the header. Tap it → the plant lands in your Shed and the button flips to **In your Shed**.
- **Care Guide tab** — sunlight, watering, edibility, toxicity, wildlife it attracts, a description, and a small image gallery.
- **Grow Guide tab** — the comprehensive 9-section grow guide. The first time you open it, it generates from Rhozly AI (Sage+); subsequent visits load instantly.
- **Companions tab** — the plants that grow well alongside this species and the ones that don't.
- **Light tab** — the optimal lux range for this plant, plus a "Get Reading" path to measure your area.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Provider badge | Where the result came from — Perenual / Verdantly / Rhozly AI |
| "In your Shed" pill | This species already exists in your Shed (filtered by home) |
| Hero image | Best image we have on file — proxied through our image cache |
| Save button | Adds the plant to your Shed. Disabled when already saved. |

### Tier-by-tier experience

| Tier | What you see |
|------|-------------|
| Sprout | Perenual + Verdantly results. Grow Guide tab is locked with an upgrade hint. |
| Botanist | Same as Sprout — both provider databases are available. Grow Guide still locked. |
| Sage / Evergreen | All three search providers (incl. AI). Grow Guide tab unlocks and generates on demand. |

### New user vs returning user vs power user

- **Brand new user**: lands on Search with a one-line hint. Typing returns instant Perenual hits; their first tap opens a preview, their second tap is usually the Save button.
- **Returning user**: the Saved tab is the fast path back to the plants they own. Search is for when they want something new.
- **Power user**: uses Search to research candidate plants for a new bed and Save to drop the keepers straight into the Shed without leaving the Quick Access flow.

### Common mistakes / pitfalls

- **"Save" feels missing for plants already in your Shed.** The button is intentionally disabled when the species is already saved — pulling the same plant in twice would create duplicate species rows.
- **AI results without Sage**: Sprout / Botanist users won't see AI matches at all. If a search returns nothing, the species may only be in the AI dataset.
- **Grow Guide takes ~10 seconds on first generate.** Subsequent visits are instant — the data is persisted to the catalogue and shared across all users.

### Recommended workflows

- **"I just bought this plant from a garden centre."** Search → tap result → check Light + Companions → Save.
- **"I want to plan a herb bed."** Search each candidate → read Companions → Save the keepers → open The Shed and assign them to your new area.
- **"Refresh me on this plant I already own."** Saved tab → tap → Grow Guide.

### What to do if something looks wrong

- **Search returns nothing**: try a more common name, or check your spelling.
- **Preview won't open**: check connection; the catalogue ensure step needs network. Errors get a clear toast.
- **Grow Guide says "service temporarily unavailable"**: try again in a moment — it's almost always a transient provider issue.

---

## Related reference files

- [Quick Access Home](./09-quick-access-home.md) — the tile that opens The Library.
- [The Shed](../03-garden-hub/01-the-shed.md) — the destination for Save flows.
- [Bulk Search Modal](../08-modals-and-overlays/04-bulk-search-modal.md) — the heavier "add many plants at once" entry point inside The Shed.
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md) — what a plant looks like once it's in the Shed.
- [Grow Guide Tab](../08-modals-and-overlays/36-grow-guide-tab.md) — the embedded tab.
- [Companion Plants Tab](../08-modals-and-overlays/11-companion-plants-tab.md) — the embedded tab.
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — global vs home-scoped row semantics.
- [Plant Providers](../99-cross-cutting/25-plant-providers.md) — Perenual / Verdantly / AI abstraction.
- [Routing](../99-cross-cutting/21-routing.md) — `/library/*` is part of the focus-mode shell.

## Code references for ongoing maintenance

- `src/components/library/LibraryHome.tsx` — page shell + nested routes
- `src/components/library/LibrarySearchTab.tsx` — search input + results
- `src/components/library/LibrarySavedTab.tsx` — shed-backed list
- `src/components/library/PlantPreview.tsx` — preview screen
- `src/lib/plantCatalogue.ts` — ensure-in-catalogue + adapter helpers
- `src/lib/saveToShed.ts` — extracted save-to-shed helper (also used by `src/components/TheShed.tsx`)
- `src/App.tsx` — route mount + focus-mode wiring for `/library/*`
- `src/components/QuickAccessHome.tsx` — the tile entry point
