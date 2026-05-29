# Plan — Companion ⓘ peek: provider fallback so pills/description always populate

## Problem

On the Companions tab, tapping the ⓘ on a companion that isn't in our
`plant_library` shows **no pills and no description** — only the "Open … for
its full care guide →" link. The user expects the ⓘ peek to look like plant
search (info pills + description), as it does for companions that *are* in the
library.

### Root cause

`resolveCompanion` in `src/components/CompanionPlantsTab.tsx` is **library-only**:

```
searchLibrary(plant.name, { pageSize: 1 })  → hit? libraryRowToPlantDetails → pills
                                            → miss? details = null → no pills
```

A miss leaves `companionDetails.get(key) === null`, so `CompanionSection`
renders the bare "open full care guide" fallback (lines 162–170). Companion
names come from the `companion-planting` edge function (AI/Verdantly) carrying
only `name` / `scientificName` / `reason` — no care data — so anything not yet
in the library has empty pills.

## App-reference files consulted

- `docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md` — **badly drifted**: it still documents the old curated `companion_plants` table + props `instance`/`homeId`. The real component uses the `companion-planting` edge function, `companion_cache`, the ⓘ inline preview, and library-first resolution. Will be rewritten in this task.
- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` — the overlay `openCareGuide` hands off to (clone-from-library/provider vs AI).
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` — Verdantly free for all tiers, Perenual self-gates; `searchAllProviders` / `getProviderPlantDetails` contract.

## Fix

Add a **provider-DB fallback (Verdantly → Perenual, no AI)** between the library
lookup and the null fallback, mirroring how plant search resolves provider rows
(`getProviderPlantDetails`). Resolution order becomes:

1. **Library** (`searchLibrary`) — free, no AI. Hit → pills from `libraryRowToPlantDetails`; care guide clones via `plant_library_id`.
2. **Provider DB** (`searchAllProviders(name, undefined, ["perenual","verdantly"])`, prefer the free Verdantly hit) → `getProviderPlantDetails` → pills. Care guide clones from that provider result. **Still no Gemini.**
3. **Miss** → `details = null` → AI-by-name result; the ⓘ shows the existing "open full care guide" link, and AI only runs if the user opens the guide.

This keeps the library-first / AI-last priority the user cares about, and makes
the ⓘ peek populate pills + description for the broad set of plants in
Verdantly/Perenual.

### Files changed

**`src/components/CompanionPlantsTab.tsx`**
- Add imports: `searchAllProviders`, `getProviderPlantDetails` from `../lib/plantProvider`.
- Replace the `companionLibId: Map<string, number|null>` state with `companionResult: Map<string, ProviderSearchResult>` — the resolved result to open (library-clone, provider-clone, or AI-by-name).
- Rework `resolveCompanion` to return `{ details, result }` and follow the library → provider → AI-by-name order above, caching both `details` (for pills) and `result` (for the care guide) per row. Provider step is best-effort (`.catch(() => …)`), preferring the Verdantly hit (free) over Perenual.
- Simplify `openCareGuide` to `setDetailResult((await resolveCompanion(plant, key)).result)`.
- No change to `CompanionSection` rendering — once `details` is non-null it already renders `PlantInfoPanel` pills; the null branch keeps the existing fallback link.

**`docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md`** — rewrite to current reality: props (`source/verdantlyId/plantName/homeId/aiEnabled/isPremium/onPlantsAdded`), `companion-planting` edge function, `companion_cache` (AI permanent / Verdantly 30-day TTL), the ⓘ inline preview, library→provider→AI resolution, rate-limit + auto-retry behaviour, "Add to Shed" source picker.

**`docs/e2e-test-plan.md`** — update the Companions-tab row to note the ⓘ peek populates pills from library-or-provider; AI only on full-guide open for misses.

## Risks / edge cases

- **Extra API calls on ⓘ tap for library misses** — one provider search + one details fetch, on demand, cached per row, behind the existing "Loading details…" spinner. Verdantly is free; Perenual self-gates via `getEnabledProviders`. Acceptable, and matches plant search's provider-row cost.
- **Fuzzy provider match returning a different species** — we take the top hit by name; same risk plant search already accepts.
- **Provider fetch failure** → falls through to the AI-by-name result (existing behaviour), no regression.

## Tests

- Resolution logic is inline component state coupled to live providers; the unit tier can't cover it without extracting a resolver (out of scope for a bug fix). Will verify in-browser: open a plant → Companions → ⓘ on a companion not in the library → pills + description appear; ⓘ on a library companion still instant; tapping a companion opens the care guide without an AI call when library/provider data exists.
- Update `docs/e2e-test-plan.md` row; no new selectors (the `companion-info-panel` testid already exists).

## Process

1. Edit `CompanionPlantsTab.tsx`.
2. `npx tsc --noEmit` clean + run unit suite (regression guard).
3. Rewrite the app-reference file; update e2e-test-plan row.
4. Add release note; deploy (`--bump 1`); push to main.
