# Plan — Add a plant to the Shed from the packet edit flow

## Goal

When linking a packet to a Shed plant inside `EditSeedPacketModal`, if the plant the user wants isn't in their Shed yet, let them search the wider plant database (AI / Perenual / Verdantly) right there. Picking and adding a result inserts it into their Shed AND links it back to the packet — one continuous flow, no jumping out to The Shed → adding the plant → coming back → re-opening the edit modal.

Restricted to adding ONE plant per launch — this isn't the bulk-add flow.

## App-reference files consulted

- [docs/app-reference/03-garden-hub/10-nursery.md](../app-reference/03-garden-hub/10-nursery.md) — the surface being extended; confirmed the linked-plant section structure.
- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — confirmed the canonical search-providers UX (the same flow `PlantSearchModal` uses today on TheShed).
- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — confirmed the existing prop chain: TheShed receives `aiEnabled` + `perenualEnabled` from `GardenHub`; only `aiEnabled` is currently threaded into `NurseryTab`.
- [docs/app-reference/99-cross-cutting/25-plant-providers.md](../app-reference/99-cross-cutting/25-plant-providers.md) — confirmed AI / Perenual / Verdantly contract used by `searchAllProviders`.
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) — confirmed `isPremium` (a.k.a. `enable_perenual`) gates the search modal entirely.

## What already exists we can reuse

`PlantSearchModal` (`src/components/PlantSearchModal.tsx`) is the exact UI we want — search input, ranked provider results (AI / Perenual / Verdantly), preview, "Add to Shed". It already:

- Single-adds — one plant per session, exits via `onSuccess(savedPlant)`.
- Duplicate-checks per provider before inserting.
- Inserts into `plants` with the right `source` + provider id columns.
- Returns the freshly-inserted row to the parent.

This naturally satisfies "restrict to one plant per launch". No new search logic; just integrate the modal.

## Changes

### 1. Thread `perenualEnabled` down to where it's needed

Currently `TheShed` receives `perenualEnabled` but only passes `aiEnabled` to `NurseryTab`. Add `perenualEnabled` to that pass-down, and thread both to `SeedPacketDetailModal` and `EditSeedPacketModal`.

| Component | Prop additions |
|-----------|----------------|
| `NurseryTab` | `perenualEnabled: boolean` |
| `SeedPacketDetailModal` | `aiEnabled: boolean`, `perenualEnabled: boolean` |
| `EditSeedPacketModal` | `aiEnabled: boolean`, `perenualEnabled: boolean` |

### 2. EditSeedPacketModal — add the "Search the plant database" path

Inside the existing "Linked plant" section:

- **When the Shed search is open AND there are 0 matching results**, surface a CTA: *"Not in your Shed yet? Search the wider plant database →"*. Also show it as a permanent action below the list (so users with a sparse Shed don't have to type a query that fails first).
- The CTA mounts `PlantSearchModal` over the edit modal with:
  - `homeId={homeId}`
  - `isPremium={perenualEnabled}` (matches the gate elsewhere)
  - `isAiEnabled={aiEnabled}`
  - `initialSearchTerm` = the user's current Shed-search text (or `localPacket.variety` / `linkedPlantName` if search is empty), so they don't have to retype.
  - `onSuccess(newPlant)` → set `linkedPlantId = newPlant.id`, `linkedPlantName = newPlant.common_name`, `linkedPlantSci = first(newPlant.scientific_name)`, close the inner modal. The edit modal's link section now shows the new plant. The user taps **Save changes** to commit the packet update.
- `onClose` → just dismisses the inner modal, returns to the editor unchanged.

If the user is on a tier without `enable_perenual` (Sprout), `PlantSearchModal` already shows its own lock screen — we don't need a duplicate gate.

### 3. State plumbing

`EditSeedPacketModal` gains:

- `const [showProviderSearch, setShowProviderSearch] = useState(false);`
- A handler `handleProviderSuccess(newPlant)` that updates the link state + closes the inner modal.
- The existing `Save changes` button stays the only commit path — the Shed insert happens immediately inside `PlantSearchModal` (it's the price of having the plant exist in the Shed), but the `seed_packets.plant_id` update only happens on Save. This is fine: a Shed plant that's never linked is a normal Shed plant — no orphan state.

### 4. Edge cases

- **User adds a plant via the provider search, then taps Cancel on the edit modal** — the plant is in their Shed, but the packet `plant_id` is unchanged. Acceptable; the user can re-open and link, OR delete the new Shed plant manually. Not a regression.
- **User adds a plant via provider search, picks it as the link, then changes their mind** and Unlinks before saving — the local state goes back to `null`, but the new Shed plant remains. Same as above — acceptable, the plant exists independently.
- **`PlantSearchModal` is portal-rendered with `z-[110]`** today (same level as our edit modal). Need to verify it stacks above EditSeedPacketModal which uses `z-[120]`. Two options: bump the search modal's z to `z-[130]` when launched from here (cleanest), or mount it conditionally only when EditSeedPacketModal is open (so portal order handles it). Going with the conditional mount + portal-order approach — it Just Works because React portals append to body in mount order; the search modal will append after the editor.
- **Duplicate handling** — already in PlantSearchModal. If the user happens to search the exact same plant twice, they get a "already in your Shed" toast. The modal doesn't close in that case, so they need to dismiss and use the regular Shed search. Acceptable.

## Files we'd change

| File | Change |
|------|--------|
| `src/components/TheShed.tsx` | Pass `perenualEnabled` to `NurseryTab` |
| `src/components/nursery/NurseryTab.tsx` | Accept `perenualEnabled`; pass `aiEnabled` + `perenualEnabled` into `SeedPacketDetailModal` (currently neither is passed) |
| `src/components/nursery/SeedPacketDetailModal.tsx` | Accept `aiEnabled` + `perenualEnabled`; pass into `EditSeedPacketModal` |
| `src/components/nursery/EditSeedPacketModal.tsx` | Accept `aiEnabled` + `perenualEnabled`; render the "Search the plant database" CTA; mount `PlantSearchModal`; wire `onSuccess` |
| `docs/app-reference/03-garden-hub/10-nursery.md` | Document the new path in the Edit flow section |

## Test coverage

Add one assertion to a new test or extend `EditSeedPacketModal.test.ts` (none today — I'll add `tests/unit/components/EditSeedPacketModal.test.ts` in this wave) to check:
- The "Search the plant database" CTA renders when the link section is showing the Shed search.
- Tapping it sets a `showProviderSearch` flag (we mount `PlantSearchModal` conditionally — we can stub it in the test).

E2E coverage isn't critical for this — the integration is one component-level handoff.

## What's deliberately out of scope

- **Customising `PlantSearchModal` for this flow.** No new modes; it already does single-add. If we later want to skip the preview step and add-on-tap, that's a separate UX call.
- **Auto-saving the packet** after the inner add — keeps the Save button as the explicit commit. Less surprising.
- **A "create blank plant" entry point** if the user doesn't even want to search providers — they can use the Manual Plant Creation flow on TheShed for that, then come back. Adding a third path here would clutter the section.

## Sequencing

1. Thread props down (TheShed → NurseryTab → SeedPacketDetailModal → EditSeedPacketModal).
2. Add the CTA + state + PlantSearchModal mount in `EditSeedPacketModal`.
3. New unit test for the CTA presence + state flip.
4. Update the app-reference.
5. Release notes + deploy.
