# Plan — Unified Plant Search (Implementation & Migration)

Follows the locked design in [plant-search-overhaul-design.md](./plant-search-overhaul-design.md). Two phases: **A** builds the shared search foundation; **B** migrates every call site onto it. Each phase ships + deploys independently.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/25-plant-providers.md`
- `docs/app-reference/03-garden-hub/01-the-shed.md`
- `docs/app-reference/07-management/10-plant-library-admin.md`
- `docs/app-reference/02-dashboard/12-the-library.md`

## Current call sites (what Phase B migrates)

All currently route through `searchAllProviders` (parallel Perenual+Verdantly+AI) except the admin tab + `/library` which already use the library RPCs:

| Surface | File | "Select" means |
|---------|------|----------------|
| Add to Shed | `BulkSearchModal.tsx` (host: `TheShed`, `CompanionPlantsTab`) | Add plant(s) to inventory |
| Plant picker | `PlantSearchModal.tsx` (hosts: nursery `EditSeedPacketModal`, `NurseryTab`, admin care-guide modal) | Pick one plant → link |
| Library | `library/LibrarySearchTab.tsx` (host: `LibraryHome`) | Open detail / save to Shed |
| Shopping add | `shopping/AddItemSheet.tsx` | Add a plant item to a list |
| Companion plants | `CompanionPlantsTab.tsx` | Add companion to Shed |
| Admin Search Lab | `admin/PlantLibrarySearchTab.tsx` | Preview / AI-add (already library-native) |

---

## Phase A — Foundation (build the engine + component)

### A1. Filtered relevance RPC (migration)
New `search_plant_library_relevance_filtered(p_query, p_page_size, p_offset, p_filters jsonb)` — same tiered ranking as `search_plant_library_relevance`, plus structured WHERE clauses driven by a `jsonb` filter blob:
- `edible` (bool), `cycle` (text), `indoor` (bool), `is_toxic_pets`/`is_toxic_humans` (bool)
- `sunlight` (contains any of N) — `sunlight ?| array[...]`
- `hardiness_min`/`hardiness_max` (range overlap)
- `query` may be empty when filters are set (browse-by-filter).
Keep the original RPC for the admin tab. Grant execute to `authenticated`. (No RLS change — `plant_library` is already world-readable to authed users.)

### A2. `unifiedPlantSearch.ts` service
```ts
searchLibrary(query, filters, page): Promise<{ rows: LibraryPlant[]; total: number }>   // relevance RPC
didYouMean(query): Promise<string[]>                                                     // fuzzy RPC, deduped top names
searchExternal(query, filters, gates): Promise<ExternalPlant[]>                          // Perenual+Verdantly, gated (Botanist+)
createWithAI(query): Promise<LibraryPlant>                                               // add-plant-to-library, gated (Sage+)
```
External + AI fns throw a typed `TierGateError` when the caller's tier is insufficient, so the component can render the upgrade nudge.

### A3. `<PlantSearch>` shared component
The single surface from the design. Props:
```ts
{
  homeId, gates: { tier, aiEnabled, perenualEnabled },
  multiSelect?: boolean,
  onSelect: (sel: PlantSelection | PlantSelection[]) => void,
  allowManual?: boolean,        // show "Add manually" fallback
  initialFilters?: PlantFilters,
}
```
Behaviour: debounced library search → results list; weak/zero → `didYouMean` chips; persistent opt-in CTAs ("Search more databases" / "Create with AI" / "Add manually") gated per tier; empty query → gentle prompt. Reuses the existing filter-panel UI (with the mobile scroll fix). Emits a normalised `PlantSelection`.

### A4. `PlantSelection` normalised type
```ts
interface PlantSelection {
  source: "library" | "perenual" | "verdantly" | "ai" | "manual";
  common_name: string;
  scientific_name?: string;
  library_id?: number;      // when source=library
  perenual_id?: number;
  verdantly_id?: string;
  thumbnail_url?: string | null;
  raw?: unknown;            // full provider record for hosts that need it
}
```
Each host maps `PlantSelection` → its own write (inventory insert, packet link, shopping item, etc.). This is the seam that lets one component serve every surface.

### A5. Ship Phase A behind no UI change
Phase A introduces the service + component + RPC but doesn't yet replace any surface. Validate `<PlantSearch>` in isolation (a temporary dev route or Storybook-style harness) + unit tests for the service. Deploy.

---

## Phase B — Migration (swap each surface onto `<PlantSearch>`)

Migrate **one surface at a time**, lowest-risk first, validating each before the next. Each is its own commit; deploy in small batches.

**Order:**
1. ✅ **Shopping AddItemSheet** — simple onSelect (add item), low blast radius. *(shipped — first proof surface)*
2. ✅ **`/library` LibrarySearchTab** — library-native + low stakes (read/preview). *(shipped)*
3. ✅ **BulkSearchModal (Add to Shed)** — highest-traffic + multi-select + paste-a-list. Search half swapped to `<PlantSearch multiSelect showFilters>`; paste-a-list + review-selection + manual + `onProceedToBulkAdd` import preserved verbatim. Library selections forward `preloadedDetails` (via new shared `libraryRowToPlantDetails` in `plantCatalogue.ts`) through TheShed's AI branch — no Gemini, TheShed untouched. *(shipped)*
4. ✅ **Nursery PlantSearchModal** (host: EditSeedPacketModal) — pick-one semantics. Search half swapped to `<PlantSearch showFilters>`; premium wall removed (library free for all); preview + `handleAddToShed` + single-add `onSuccess` kept verbatim. Library selections preview via `libraryRowToPlantDetails` and save through the AI insert branch. *(shipped)*
5. ✅ **CompanionPlantsTab** — covered automatically: it has no search box of its own; it hosts the migrated `BulkSearchModal` (verified its `handleBulkAdd` consumes the new cart-item shapes + library `preloadedDetails`).

> Note: the original order put BulkSearchModal last; in practice `/library` + Shopping landed first as proving grounds, then BulkSearchModal (which also serves the TheShed + CompanionPlantsTab hosts), then the Nursery picker.

**End state:** every interactive search box now routes through `<PlantSearch>`. `searchAllProviders` has no remaining direct surface callers — its sole caller is `unifiedPlantSearch.searchExternal`, so it's retained as the **opt-in external engine** (not deleted). `PlantSourcePicker` (a batch name-resolver, not a search box) and the Admin Search Lab keep their own provider logic by design. The per-surface search code the plan earmarked for deletion (each modal's `performSearch`/pagination/snapshot machinery) has been removed as part of each swap.

Admin Search Lab stays as-is (it's a power tool with its own methods) — or optionally adopts the shared component later.

**After all surfaces move:** delete `searchAllProviders` fan-out + the now-unused per-surface search code. Update `plant-providers.md` to describe the library-first model.

---

## Tiering verification
E2E + manual check per tier:
- Sprout: library search + filters + spelling work; external/AI buttons show upgrade nudges.
- Botanist: external search works; AI-create nudges.
- Sage/Evergreen: everything.

## Tests
- Unit: `unifiedPlantSearch` (mock supabase RPC) — relevance mapping, didYouMean dedup, tier-gate errors.
- Deno: the filtered RPC (a `supabase/tests/` query test).
- E2E: one spec per migrated surface as it lands; update Page Objects.

## App-reference docs to update
- `25-plant-providers.md` — rewrite around library-first + opt-in expand.
- `12-the-library.md`, `01-the-shed.md`, `10-plant-library-admin.md` — note the shared `<PlantSearch>`.
- New cross-cutting ref `36-plant-search.md` documenting the component + service + RPCs + tiering.

## Risks
- **Behaviour drift per surface.** Mitigated by migrating one at a time + E2E per surface + keeping each host's onSelect write identical.
- **Library coverage gaps.** If the library lacks a common plant, the opt-in external/AI paths cover it; monitor "0-result then expanded" rates.
- **Multi-select + paste-list (BulkSearchModal)** is the trickiest host — explicitly migrated last with the review-selection flow preserved.

## Deploy cadence
- Phase A: one deploy (foundation, no visible change).
- Phase B: 2–3 deploys (batched surfaces), each re-scored against the design before the next.

## Next step
On approval, start Phase A: the filtered RPC migration + `unifiedPlantSearch` service + `<PlantSearch>` component, validated in isolation before any surface is touched.
