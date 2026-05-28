# End of Life — first-class section for ended plant instances

## Goal

Turn "End of Life" from a hidden state on `inventory_items` into a first-class destination users can navigate to:

- See all instances whose lifecycle has ended
- Read each one's closing note, photo, and AI analysis (when present)
- **Restore** an instance if it was marked by mistake — flips it back to its previous status

This builds on top of three things we already have:
1. `inventory_items.ended_at` / `was_natural_end` / `end_summary` columns (shipped with the lifecycle work)
2. `LifecycleCompleteModal` + `LifecycleAnalysisModal` (the capture + analysis flow)
3. `InstanceRemovalModal` (the unified archive/delete/EoL modal I started building in this session — needs to land before the new view)

## Naming — pick the right word

The user suggested "maybe we can use the plant technical term". The botany term is **Senescence** — the natural aging/dying phase of a plant. It's already used in our `plant_grow_guides` schema (one of the 9 category sections), so the vocabulary is consistent with how Rhozly describes a plant's natural lifecycle. But it's intimidating for a new gardener.

Candidates (will need to confirm with user):

| Name | Personas | Notes |
|---|---|---|
| **Senescence** | Expert: instantly · New: needs an InfoTooltip | Technical/botanical. Matches existing grow-guide vocabulary. Could read clinical. |
| **Retired plants** | Both: clear | Friendly, gardening-adjacent. Plants "retire" gracefully. |
| **Garden history** | Both: clear | Neutral, broadest framing. Slightly bland. |
| **Past plants** | Both: clear | Accessible, simple. Loses the "lifecycle" framing. |
| **Lifecycle complete** | Both: clear | Matches existing modal name. Consistent across the app. |

My recommendation: **Senescence** with the subtitle "Plants whose lifecycle has ended" — leans into the technical term that's already in our grow-guide vocabulary, with an InfoTooltip explaining it for new gardeners. Wave 2 set the precedent for persona-aware copy via InfoTooltip; this fits.

Alt: **Retired** if we want pure accessibility.

## Scope of the change

| Question | Current | Proposal |
|---|---|---|
| Where does an ended instance live today? | DB only — `ended_at IS NOT NULL` on `inventory_items`. No UI surface lists them. | New section in the Plants surface — listed below. |
| How does a user end a plant's lifecycle today? | Two paths: (1) the deliberate "Mark lifecycle complete" CTA inside `InstanceEditModal` → `LifecycleCompleteModal`, OR (2) the new Archive / Delete buttons on `PlantInstancesTab` → `ConfirmModal` (now being replaced by the unified `InstanceRemovalModal`). | Single canonical path: the unified `InstanceRemovalModal` (already being built) which surfaces End of Life as the recommended action vs "Archive only" / "Delete" as the rough/quick fallbacks. |
| Does Archive go away? | For instances, "Archive" today just flips `status = "Archived"`. | Keep "Archive only" as a quick-path fallback (mistaken row, doesn't deserve a closing note). End of Life is the recommended path. Plant species in The Shed / Library still use Archive as before (different concept). |
| Where in the nav? | n/a | A new tab on `GardenHub`: `Plants \| Ailment Watchlist \| Senescence`. Routes via `/shed?tab=senescence`. |
| Reversal? | No way today. | Each row in the Senescence view has a **Restore** action — confirms via ConfirmModal, then nulls `ended_at` / `was_natural_end` / `end_summary` and flips `status` to `"Planted"`. Toast: "Restored to active plants." |
| Surfacing on the per-plant Instances tab? | The PlantInstancesTab filters out `status = "Archived"` (which catches all ended ones). | Add a small "X ended" link/banner above the list when the plant has any ended instances. Link drops the user into the Senescence tab pre-filtered to this plant. |

## How does this differ from the existing "Archive" pattern in The Shed?

Important distinction the user already flagged:

- **The Shed (Plants tab)** lists **`plants` species records**. Plant species have `is_archived: boolean`. Archive there means "stop offering this plant to me when I'm adding new instances" — keeps the species in the catalogue but tucks it away. This stays.
- **GardenHub Senescence tab** lists **`inventory_items` instance records** with `ended_at IS NOT NULL`. End of Life there means "this specific plant in my garden has finished its life cycle". This is new.

These are different data tables, different concepts, different chrome — they coexist cleanly.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Section name | **Senescence** (recommended) — botanical, consistent with grow-guide vocabulary. InfoTooltip provides the plain-English definition. Open to swap. |
| Route | `/shed?tab=senescence` — sits alongside the existing Plants and Ailment Watchlist tabs in GardenHub. No new top-level route. |
| Quick-archive path (instance "I just want to hide this") | Keep it as a secondary button inside `InstanceRemovalModal` ("Archive only") but lead with End of Life. |
| Delete path | Keep — for truly mistaken adds the user wants gone forever. Both archive-only and delete sit behind the End of Life recommendation. |
| Restore behaviour | Nulls `ended_at` / `was_natural_end` / `end_summary`; flips `status` to `"Planted"`. Does NOT regenerate routines or tasks (those still exist if they were never archived). Closing journal entries stay (history is preserved). |
| Restore copy | Confirm modal: "Restore {plant} to active plants? It'll reappear in your Plants and Routines. Closing note + final photo stay in the journal." Confirm button: "Restore". |
| Empty state for Senescence tab | Friendly: "Nothing here yet — when a plant's lifecycle ends, you'll see it remembered here." Slight encouragement, not gloomy. |
| Pagination | None — most users will have a handful at most. Hard cap of 200 rows. |
| Filtering | Two pills at top: All / Natural / Not-natural. Helps experts triage learning opportunities. |
| Sort order | Newest first (`ended_at DESC`). |
| Per-row content | Plant name, ended-on date, was-natural badge, area it lived in, opening hint of the closing note (if present), thumbnail of final photo. Tap → opens `InstanceEditModal` in read-mostly mode showing the analysis (`Lifecycle analysis` journal entry). |
| Tier gating | None — viewing + restore is available on every tier. AI analysis on the original capture is already Sage+ gated; that's unchanged. |

## App-reference files consulted

- [`docs/app-reference/03-garden-hub/01-the-shed.md`](docs/app-reference/03-garden-hub/01-the-shed.md) — current archived-plants view (species, not instances)
- [`docs/app-reference/08-modals-and-overlays/37-lifecycle-complete.md`](docs/app-reference/08-modals-and-overlays/37-lifecycle-complete.md) — the EoL capture flow
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](docs/app-reference/99-cross-cutting/03-data-model-plants.md) — `inventory_items` fields (`ended_at`, `was_natural_end`, `end_summary`)
- [`docs/app-reference/99-cross-cutting/19-rls-patterns.md`](docs/app-reference/99-cross-cutting/19-rls-patterns.md) — confirms no new RLS needed (home-scoped via existing policies)

## Implementation order

### Phase 0 — Land the unified removal modal (already in progress)

1. Finish wiring `InstanceRemovalModal.tsx` (currently built but not yet swapped in) into:
   - `PlantInstancesTab.tsx` — replaces the `ConfirmModal` used today
   - `InstanceEditModal.tsx` — replaces the inline `LifecycleCompleteModal` invocation (keeps the same external contract)
2. Wire the post-EoL `LifecycleAnalysisModal` from the parent surface so the user sees the AI cards after marking end of life.

### Phase 1 — Senescence tab on GardenHub

3. New component `SenescenceTab.tsx` — fetches `inventory_items` where `home_id = X AND ended_at IS NOT NULL`, ordered by `ended_at DESC`, limit 200.
4. Row component shows plant + ended date + natural badge + closing note snippet + photo thumb. Tap opens `InstanceEditModal` in read-mode.
5. Filter pills (All / Natural / Not natural).
6. Empty state.
7. Hook into `GardenHub.tsx` — adds `{ id: "senescence", label: "Senescence", icon: <Leaf/> }` between Plants and Ailment Watchlist.

### Phase 2 — Restore flow

8. Add a Restore button on each row in `SenescenceTab.tsx` (icon button — ArchiveRestore).
9. ConfirmModal: "Restore {plant} to active plants?"
10. On confirm: `UPDATE inventory_items SET ended_at = NULL, was_natural_end = NULL, end_summary = NULL, status = 'Planted' WHERE id = X`.
11. Insert a closing journal entry: subject "Restored from Senescence", body "Brought back to active care."
12. Toast + remove row from list.

### Phase 3 — Cross-surface link from PlantInstancesTab

13. When the user is on the per-plant Instances tab and that plant has any ended instances, show a small banner at the top: "3 ended — see them in Senescence →". Link routes to `/shed?tab=senescence&plant=X`.
14. Senescence tab reads the `plant` query param and pre-filters.

### Phase 4 — Harvest-driven End of Life prompt

15. New component `HarvestEndOfLifePrompt.tsx` — a lightweight, multi-select modal that fires *after* a Harvesting task is marked done, before the user moves on.
16. Trigger logic in `TaskList.tsx` (both single + bulk completion paths):
    - When a completed task has `type === "Harvesting"` AND `inventory_item_ids.length > 0` AND at least one of those instances is not already ended (`ended_at IS NULL`), queue the prompt.
    - Same queue pattern as the existing `pendingSowingPrompts` for Planting tasks.
17. Modal content:
    - **Header**: "Just harvested {N plants}. Any reach the end of their life cycle?"
    - **Subtext**: "Skip if these plants will keep producing — many vegetables, herbs and perennial fruits harvest multiple times in a season."
    - **Instance list**: one row per `inventory_item_id`, each with a checkbox. Default = unchecked. Row shows nickname/identifier + area + a small status pill.
    - **Footer**: `Skip` (left) · `Mark X selected as End of Life` (right, disabled when nothing ticked)
18. On confirm:
    - For each ticked instance, set `ended_at = now()`, `was_natural_end = true`, `end_summary = null`, `status = "Archived"`.
    - Insert a closing journal entry per instance with subject "Lifecycle complete (harvested)" linking to the completing task via `task_id`.
    - No AI analysis (harvests are natural ends — `was_natural_end = true` short-circuits the analysis path).
    - Toast: "Marked X plants as End of Life. View in Senescence."
19. The remaining instances (the ones the user left unticked) stay as active plants — they'll show up in the next harvest schedule as expected. This is the canonical "this is a repeat harvester" path.
20. **Skip path**: closes the modal, no DB writes. The user can always come back to mark instances via per-row EoL on PlantInstancesTab.

### Wrap-up

15. App-reference docs:
    - New file `docs/app-reference/03-garden-hub/12-senescence.md` (Role 1 + Role 2)
    - Update `00-INDEX.md` to add the new entry
    - Update `01-the-shed.md` to cross-link
    - Update `37-lifecycle-complete.md` to mention the Senescence view as the destination
    - Update `03-data-model-plants.md` to document the restore flow
16. Vitest: pure helpers for the senescence query / filter logic (if any). Component tests skipped — visual swaps.
17. Typecheck + tests + deploy.

## Files

### New

| File | Purpose |
|---|---|
| `src/components/InstanceRemovalModal.tsx` | Already built — needs to be wired in (Phase 0). |
| `src/components/garden/SenescenceTab.tsx` | The new tab content. |
| `src/components/HarvestEndOfLifePrompt.tsx` | Multi-select prompt that fires after harvest task completion (Phase 4). |
| `docs/app-reference/03-garden-hub/12-senescence.md` | New reference doc. |

### Modified

| File | Change |
|---|---|
| `src/components/plant/PlantInstancesTab.tsx` | Swap `ConfirmModal` for `InstanceRemovalModal`. Add the "X ended → Senescence" banner. |
| `src/components/InstanceEditModal.tsx` | Reuse `InstanceRemovalModal` for its "Mark lifecycle complete" CTA, so all paths converge. |
| `src/components/GardenHub.tsx` | Add the new Senescence tab. |
| `src/components/TaskList.tsx` | Queue the `HarvestEndOfLifePrompt` after Harvesting task completion (both single + bulk paths). |
| `docs/app-reference/00-INDEX.md` | New row. |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | Cross-link to Senescence + clarify species-archive vs instance-EoL split. |
| `docs/app-reference/08-modals-and-overlays/37-lifecycle-complete.md` | Note the destination + the new `InstanceRemovalModal` wrapper. |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | Document the restore flow. |

## Decisions to confirm before implementation

1. **Name** — Senescence (botanical, lean into the technical) or Retired (friendliness) or Lifecycle complete (consistency with the modal) or Garden history (neutral)?
2. **"Archive only" inside the removal modal** — keep as a secondary action (current plan), or drop entirely and route all "remove" intents through End of Life?
3. **Senescence tab placement** — third tab on `GardenHub` (current plan), or its own top-level nav entry? Top-level is heavier; the tab is lighter and discoverable from where instances live today.
4. **Cross-surface "X ended" banner on PlantInstancesTab** — yes (current plan) or skip and let users navigate via the Senescence tab unaided?
5. **Restoration** — also fire an `applyPlantedAutomations` to re-create any routines that were scrubbed when the lifecycle ended, or trust the user to set up routines manually?
6. **Harvest prompt fields** — keep it lightweight (just multi-select checkboxes + one "Mark as End of Life" button, defaulting to `was_natural_end = true` with no closing note), or also include closing-note + photo capture (one set applied to all selected)? Lightweight is the current plan; the user can always add a closing note later via the per-instance journal.
7. **Harvest prompt trigger frequency** — fire every harvest task completion (current plan, with prominent Skip), or only on one-off Harvesting tasks (skip recurring blueprint-generated ones since they imply repeat-harvesting)? Recurring blueprints are how raspberries / strawberries / herbs typically get scheduled, so skipping them removes most of the noise — at the cost of missing end-of-season prompts for those plants. |
