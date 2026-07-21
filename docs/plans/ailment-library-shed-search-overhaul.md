# Ailment Library expansion + Shed search-first overhaul — 2026-07

**Status:** PLAN — awaiting approval. No code until the §8 decisions are made.
**Verification:** grounded by a 5-agent recon workflow (file:line-cited) AND adversarially verified by a fresh skeptic agent against the source — six corrections were folded in (favourite-wrapper mechanics, `?ailment=` push+reactive params, the autoImport→review opener, review-step extract-not-reuse + setPageContext, per-worker global-table seeding rules, Shepherd tour anchors).

## 1. Goal (user's ask, 2026-07-21)

> "I like that the ailment library has its own area — now massively expand it. Click each ailment → see details; add it to a saved list (heart — or maybe binoculars) which adds it to the watchlist. Then tie this into a complete Shed overhaul: I like full-screen ailment search vs a search modal — do this for plant search too. Search at the forefront, clean and crisp, the focal point (the modal is small, especially on phone). Keep favourites — easy to access, assign to locations/areas, generate tasks, care guide / grow guide / companions, the usual tabs. Think of the gardening personas; don't make it look AI-generated."

## 2. App-reference files consulted

`03-garden-hub/01-the-shed.md` · `03-garden-hub/02-watchlist.md` · `99-cross-cutting/06-data-model-ailments.md` · `99-cross-cutting/36-plant-search.md` · `99-cross-cutting/03-data-model-plants.md` (via recon) · `99-cross-cutting/40-design-system.md` + `docs/DESIGN.md` · `08-modals-and-overlays/{05-plant-search-modal,38-plant-detail-modal,08-instance-edit-modal,06-plant-edit-modal}.md` (via recon) · `99-cross-cutting/17-tier-gating.md` (favourite source×tier matrix). Recon: a 5-agent parallel deep-read (ailments / shed / plant-search / instance-tabs / design-personas), all findings file:line-cited.

### What recon established (the load-bearing facts)

**Ailments.** Three data layers: global read-only `ailment_library` (bigserial id, `name_key` dedup, severity low→critical, kind pest/disease/invasive/disorder, symptoms/causes/treatment/prevention, image fields, service-role writes only) · home-scoped `ailments` watchlist rows · `plant_instance_ailments` links. The library page (`AilmentLibrary.tsx`, `/ailment-library`) is a full-page browse (max-w-5xl, client-side search over 1000 rows, kind chips) whose cards are **icon-only (no thumbnails)** and whose detail is a **small z-[60] max-w-lg modal** with an "Add to watchlist" button (`addLibraryAilmentToWatchlist` → `mapLibraryToWatchlistPayload`, source `'library'`) and a shareable `?ailment=<id>` deep-link already synced to the modal. **No watching-state detection, no favourite affordance in the library.** Cross-home ailment favourites are FULLY BUILT on the watchlist side (`user_favourite_ailments`, heart on cards, `favouritesService`, server tier-gate trigger, tombstones) — the library just doesn't surface them, and favouriting FROM the library is actually the *easy* case (the library id resolves directly; no name_key guessing). Lucide 1.7.0 exports `Binoculars`. The library file is pre-token legacy (stock `bg-red-100` chips, arbitrary `text-[10px]`) — migrate-on-touch applies.

**Shed.** `/shed` = GardenHub (tabs shed/watchlist/senescence; `switchTab('shed')` **wipes all params**). `TheShed.tsx` (3,020 lines): SWR-cached grid, one sticky toolbar, contextual chips from 4 parallel queries, multi-select bulk bar, **10 portal modals**. Add chain: `shed-add-plant-btn` → **BulkSearchModal** (centered `max-w-3xl h-[85vh]` dialog; Search/Manual tabs + paste-a-list; hosts the shared `<PlantSearch multiSelect showFilters allowPreview onViewDetails>`) → review cart → `handleProceedToBulkAdd` → `saveToShed` (canonical insert + auto seasonal `plant_schedules` + offline queue). Deep links: `?open=add-plant&query=` (canonical; Plant Doctor + planner use it, with `state.returnTo`) plus legacy `/shed/add/*` pathname matches. Verified phone pain: all flows are centered dialogs (never sheets), 8–11px micro-type, 36px heart/kebab, 32px steppers, toolbar wraps to 3+ rows at 390px, PlantEditModal's 7-tab strip has ≥3 tabs off-screen on mobile. Plant favourites: cross-home tables + hearts exist; **from a favourite the ONLY actions are add-to-home + remove — no assign path**.

**Plant search.** `unifiedPlantSearch.ts` + `shared/PlantSearch.tsx` (770 lines) is layout-agnostic — **renders a plain div, zero modal chrome**; `initialQuery`/`onQueryChange` were built for the retired `/library` page's URL sync; the relevance RPC supports pagination the component doesn't yet use. `PlantDetailModal` (5 tabs: Care/Grow/Companions/Light/Soil) + all 9 non-Details instance-tab bodies are self-contained, render-anywhere components. **Doc drift found:** `36-plant-search.md` still documents the deleted `/library` route/`LibrarySearchTab` and says 4 detail tabs (it's 5); `08-instance-edit-modal.md` says `inventory.edit` (real key: `shed.edit`).

**Design/personas.** Tokens + anti-AI checklist are codified (status-* families, 3 radii, green shadows, `can-hover`, ≤1 blur/screen — **already saturated on /shed**: GardenHub bar + TheShed toolbar both blur), editorial-column + un-boxed-list rules, `SegmentedTabs` is the sanctioned pill primitive (TheShed hand-rolls 3 pill toggles). Persona: `effectivePersona()` null⇒new; two patterns — structural presets (Home only) vs `isNewGardener` guidance-density booleans (~10 surfaces). Persona alters guidance, never capability.

**Repair-in-passing opportunities:** (a) `handleBulkAssign` never calls `AutomationEngine.applyPlantedAutomations` — bulk "already planted" assigns silently get no recurring blueprints (single-assign does); (b) the source filter omits `verdantly`; (c) the two doc drifts above.

---

## 3. Design — Part A: the Ailment Library, expanded

**North star:** the library becomes a true reference wing — browse like a field guide, open an entry like a page in it, and act (watch it / favourite it) without leaving.

### A1 — Cards worth browsing
- **Thumbnails**: cards render the library row's image via `SmartImage` with a kind-tinted icon tile fallback (mirroring `PlantInitialTile` — same kind → same tint). No more icon-only wall.
- **Live state on the card**: a **Binoculars "Watch" quick-action** on each card (adds to this home's watchlist via the existing `addLibraryAilmentToWatchlist`; becomes a filled "Watching ✓" state when a home `ailments` row matches by normalized name — **verified stable**: the mapper writes `name` verbatim and no UI path renames watchlist ailments). Semantics (decided): non-archived rows only count as "Watching"; a same-named manual/Perenual/AI row also reads as Watching (desirable — it IS being watched). Permission: `can("ailments.add")` gates the action (watching writes a home row — needs `usePermissions` wiring, the page has none today); the state chip shows for everyone.
- **Filters grow up**: kind chips stay; add a **severity** filter row and a "**Watching**" smart chip (show only entries already in this home's watchlist). Search stays client-side (1000-row cap is fine).
- **Token migration on touch**: severity → status families (low→`success`, moderate→`caution`, high→`watch`, critical→`danger`), kind chips → tokens, `text-2xs/3xs` replaces arbitrary px, `rounded-chip`, card = house surface. The severity/kind colour maps become a small exported helper so cards + detail + watchlist can share them.

### A2 — A detail worth reading (the "field-guide page")
Replace the small modal with a **full-page detail takeover** inside `/ailment-library`, driven by the `?ailment=<id>` param — **with two verified fixes**: opening must **push** (today's `replace:true` means the back button doesn't close the detail) and `selected` must derive **reactively from params** (today's one-shot mount effect means the watchlist's "In library" chip only works on fresh mounts). Browse state (search/kind) survives behind the takeover (plain React state — verified). History depth changes intentionally: back from a deep-linked detail lands on the library browse, not the referrer. Layout: hero row (image / kind-tinted tile, name + scientific name + aliases, kind + severity chips, season + organic-friendly badges) → **action bar** → editorial sections (Description · Symptoms · Causes · Treatment · Prevention · Affected plants/families) in an un-boxed `divide-y` column (anti-card-wall rule), `max-w-3xl` reading column.

**The action bar** (the user's ask, answered precisely):
| Action | Icon | What it does | State |
|---|---|---|---|
| **Watch** | `Binoculars` | Adds to this home's watchlist (existing mapping, source `'library'`) | → "Watching" filled state; `can("ailments.add")`-gated |
| **Favourite** | `Heart` | Saves to *your* cross-home favourites. **Mechanism (verified):** `favouriteAilment` currently requires a home-row shape + re-resolves the library id by name — refactor it to accept an **optional pre-resolved `libraryId`** and add a thin `favouriteLibraryAilment(row)` wrapper (kind→type mapping), skipping the redundant ilike | `aria-pressed` fill; never permission-gated; source `'library'` is tier-open |
| **Ask Rhozly AI** | `Sparkles` | Opens Plant Doctor chat with the ailment as page context — **new work on this surface** (the mechanism exists app-wide, but AilmentLibrary has no `setPageContext` wiring today) | Sage/Evergreen |

Recommended semantics (Q1): **binoculars = watch it in THIS garden** (it lands on the *watch*list — the metaphor writes itself), **heart = keep it with YOU across gardens** (consistent with every existing heart in the app). Both actions already exist in the data model; the library just finally exposes them side-by-side.

- **"Could affect your garden" strip** (small, persona-warm): match `affected_plant_types`/`affected_families` against the home's shed plants and show up to 3 matches ("You grow 2 plants this pest loves: Tomato, Basil") with a link into the Shed. New gardeners get the fuller sentence; experienced get the compact chip row (`isNewGardener` pattern). Client-side match over already-cached shed data — no new backend.
- Detail is read-only reference — editing stays on the watchlist copy (the library is service-role-write territory).

### A3 — Watchlist coherence (small)
- The watchlist's "Browse the ailment library" dashed button gets a Binoculars icon + the AddAilmentModal's library-tier rows show a "Watching ✓" state for already-added entries (same name_key check) — closing the loop from both directions.

**Part A files:** `AilmentLibrary.tsx` (substantial rewrite: cards, filters, detail takeover) · `ailmentLibraryService.ts` (fetch home-watchlist name_keys; severity/kind token maps) · `favouritesService.ts` (a thin `favouriteLibraryAilment(row)` wrapper — direct library-id path) · `AilmentWatchlist.tsx` (A3 touches only). **No migrations** — every table, index, and RLS policy needed already exists.

---

## 4. Design — Part B: the Shed, search-first

**North star:** one search box is the front door to everything green — it finds *your* plants instantly and reaches the world's when yours run out. Adding a plant is a full-screen experience, not a porthole.

### B1 — The full-screen "Find a plant" experience (kills the modal)
The `shed-add-plant-btn` (and every `?open=add-plant&query=` deep link — the param contract is **kept verbatim** so Plant Doctor/planner links keep working, incl. `state.returnTo`) now opens a **full-page search takeover** inside the Shed instead of `BulkSearchModal`:

- **Layout** (the AilmentLibrary recipe, re-clothed in tokens): full page column, a **large always-visible search field** at top (autoFocus, `TextField` primitive sizing, ≥44px), the structured filter chips beneath, results as a full-width list/grid with room to breathe — no `h-[85vh]` cap, no `p-8` porthole, no `text-[8px]`.
- **Engine**: the existing `<PlantSearch multiSelect showFilters allowPreview onViewDetails>` mounted as the page body — zero fork of search logic; library-first + did-you-mean + opt-in external/AI CTAs + the ⓘ preview all come along free, with their testids.
- **The cart becomes a sticky bottom tray** (phone) / side summary (xl+): selected plants accumulate with thumbnails; "Review N plants" advances to the review step as a second view state of the takeover. The cart-item *shapes* (`buildCartItem`/`selectionKey` — pure, liftable) + `preloadedDetails` forwarding + `handleProceedToBulkAdd` pipeline are reused as contracts (user_plant_ack seeding, no-Gemini library path); the review *JSX* is **extracted, not reused verbatim** — it's currently inline in BulkSearchModal, entangled with the modal's state cluster + `fetchDetails` (verified). The takeover must also replicate BulkSearchModal's `setPageContext` wiring so the AI chat keeps search context, and restore grid scroll/focus on close.
- **Third opener (verified, previously missed):** `location.state.autoImport` (from AreaDetails, PlantActionButtons, PlanStaging) currently opens BulkSearchModal **directly into the review step** with `initialCartItems`. The takeover must support open-into-review with preloaded items or those three flows break.
- **Frame decision:** the takeover renders **inside GardenHub's frame** (under the hub tab strip — keeps the one-blur budget and the hub's mental model). Tapping the "Plants" hub tab while the takeover is open **closes the takeover** back to the grid; switching to Watchlist/Senescence unmounts TheShed (existing behaviour) and abandons takeover state — acceptable, matches the modal today.
- **Manual / paste-a-list / CSV** remain: quiet entries under the search ("Add manually", "Paste a list", "Upload CSV" → the existing `ManualPlantCreation` inline + `BulkPastePlantsModal`).
- **Detail from a result**: `onViewDetails` keeps opening `PlantDetailModal` (Care/Grow/Companions/Light/Soil — "the usual tabs") over the takeover; on phone the modal already fills most of the screen.
- BulkSearchModal itself **stays** for its other host (CompanionPlantsTab) in this batch — one front door at a time.

### B2 — The search-first Shed landing
- The toolbar search is promoted to the **hero position**: one prominent field ("Search your plants…") directly under the title, full-width on phone. Typing filters your grid live (existing client-side filter, unchanged).
- **The escalation row**: when your own results are thin (≤2 matches), an inline row appears under the grid — *"Don't have it yet? **Search the library for 'rosemary'** →"* — one tap into the B1 takeover with `initialQuery` pre-seeded. One search box, two worlds, the app's established library-first + escalate pattern applied to the Shed itself.
- **Persona-aware entry** (`isNewGardener`, guidance-not-capability): new gardeners see 4–5 warm **browse chips** under the hero when the shed is small ("🍅 Edible favourites", "Indoor friends", "Full-sun lovers" — wired to the structured `PlantFilters` browse mode, which needs no query); experienced gardeners get the compact toolbar as-is. Copy is specific and warm, never templated.
- Toolbar de-clutter: scope pills / Active-Archived / Filters stay but migrate to `SegmentedTabs` + consolidate to **one** blurred sticky surface on the page (the blur budget is currently doubled).

### B3 — Favourites that DO things (the user's explicit list)
- **Assign from a favourite**: `FavouritePlantsGrid` gains **"Add & assign…"** — copies to home via the existing `addFavouritePlantToHome`, then immediately opens `PlantAssignmentModal` on the new row (areas → task generation → smart schedules — the full existing pipeline). The current copy-only "Add to this home" stays as the quiet secondary.
- **Hearts at search time**: library result rows in the B1 takeover get the ♥ toggle (favouritesService; `isSourceLockedForTier` respected both sides) so building your favourites list happens while browsing, before anything is even in the Shed.
- **Repair-in-passing**: `handleBulkAssign` gains the missing `applyPlantedAutomations` call (parity with single assign — recon-verified asymmetry); the source filter gains `verdantly`.

### B4 — Craft & consistency pass (migrate-on-touch obligations)
44px floors on the card heart/kebab + assignment steppers (`pointer-coarse:`) · `SegmentedTabs` for the three hand-rolled pill toggles · touched stock-palette classes → status tokens · PlantEditModal's off-screen tab strip gets a visible affordance fix on phone (scrollable pills with edge-fade + snap already exist; add the count/scroll hint or two-row wrap — smallest fix that works) · every new interactive element gets a testid (Assign button + Active/Archived pills currently have none — recon flagged).

**Explicitly out of scope (unchanged):** PlantEditModal/InstanceEditModal tab *content*, the assignment/task-generation pipeline internals, the Nursery, offline queue mechanics, `plants_source_check`, provider gating. "The usual tabs" are preserved, not rebuilt.

---

## 5. Invariants the build must respect (recon-verified)

1. Cart-item shape contract (`{type, data, preloadedDetails?}`) + `user_plant_ack` seeding — dropping either resurrects the eternal "Care guide updated" bug.
2. `?open=add-plant&query=` + `/shed/add/*` pathname handling + `state.returnTo` — Plant Doctor/planner deep links must keep working unchanged.
3. `GardenHub.switchTab('shed')` wipes URL params — the takeover's URL state must survive or intentionally reset.
4. AI-create auto-selects on success (`onSelect` fires immediately) — the takeover's onSelect must stay safe to fire without confirmation.
5. Favourite gating is two-sided (client `isSourceLockedForTier`/`isAilmentSourceLockedForTier` + server triggers) — every new heart keeps both.
6. Search stays online-gated; the insert path stays offline-queue capable.
7. Blur ≤1/screen; no novel radii; status tokens; `can-hover`; 44px; `animate-in` shim only (no exit anims); SparkleAccent ≤1.
8. Load-bearing e2e selectors (scope pills, `?scope=favourites`, search aria-label, Active/Archived text, `plant-search-*`, `garden-hub-tab-*`, **and the `bulk-search-*` testids** — `shed-crud.spec` drives `bulk-search-review`/`bulk-search-start-import` via ShedPage) — survive or update Page Objects + test-plan in the same task.
8b. **Shepherd tours (verified breakage risk):** `flowRegistry.ts`'s manual-add tour anchors `shed-add-plant-btn` → **`bulk-search-tab-manual`** → `plant-form-save-btn`, and the garden-hub tour's copy describes the modal flow. Stage 2 MUST update these anchors + copy to the takeover's equivalents in the same slice, or the tour dead-ends at step 3.
9. `ailment_library` is service-role-write only — the library UI never writes it; watch/favourite write `ailments` / `user_favourite_ailments` only.
10. Persona alters guidance density, never capability; `effectivePersona()` is the only null-collapse.

## 6. Stages (deployable slices — deploy-then-continue per stage)

| Stage | Ships | Main files |
|---|---|---|
| **1 — Field-guide library** | ✅ BUILT (awaiting deploy). A1 cards+filters+watching-state · A2 detail takeover + Binoculars/Heart/AI actions + could-affect strip · A3 watchlist loop-closers ("Watching ✓" via `existingKeys`; Binoculars browse button) · token migration. New `src/lib/ailmentPresentation.ts` (maps + `matchAffectedPlants`); `favouriteAilment` gained `preResolvedLibraryId`; `libraryRowToFavouriteInput` + `favouriteLibraryAilment`; new seed `16_ailment_library.sql`. Tests: unit +9 (1582 green), e2e AILIB-001..003/010..013 all passing live. Docs: NEW `03-garden-hub/16-ailment-library.md` + INDEX, watchlist.md, data-model-ailments, e2e-plan §36, TESTING.md | `AilmentLibrary.tsx`, `ailmentLibraryService.ts`, `favouritesService.ts`, `AilmentWatchlist.tsx`, `App.tsx` (aiEnabled prop) |
| **2 — Full-screen plant search** | B1 takeover replacing BulkSearchModal as the Shed front door (same deep-link contract + the autoImport→review path), cart tray, extracted review step, manual/paste/CSV entries, setPageContext parity, **tour-anchor updates** | new `shed/PlantSearchTakeover.tsx` (composition only — engine reused), `TheShed.tsx` wiring, `onboarding/flowRegistry.ts` |
| **3 — Search-first landing** | B2 hero search + escalation row + persona browse chips + toolbar consolidation (blur, SegmentedTabs) | `TheShed.tsx`, `GardenHub.tsx` |
| **4 — Favourites act + craft** | B3 add-&-assign, search-time hearts, bulk-assign blueprint repair, verdantly filter · B4 44px/token/testid pass | `FavouritePlantsGrid.tsx`, `PlantSearch.tsx` (heart row affordance), `TheShed.tsx`, `BulkAssignModal.tsx` |

Every stage: three-tier tests + app-reference sync (incl. fixing the two found doc drifts in stages 2/4) + fresh code-review + typecheck/build/unit + deploy + push main.

## 7. Tests & docs

- **Unit:** severity/kind token maps, watching-state matcher (name_key), could-affect matcher, escalation-row threshold, favourite-wrapper; existing favourites/identity suites extended.
- **E2E:** ailment-library.spec grows detail/watch/favourite flows (seed 2–3 `ailment_library` rows for workers — currently unseeded, shell-only tests; **seeding cautions, verified**: the table is GLOBAL and the seed runs once per worker → must be `ON CONFLICT (id)` idempotent with explicit ids + `setval`; avoid the runner's worker-substitution literal patterns; avoid name collisions with `15_favourites`' tombstone names or those tests' tombstone assumptions break); a new shed-search-takeover.spec (open via button + deep link + autoImport→review, select→cart→review→import, escalation row); favourites add-&-assign (online-gated — assigning an offline-queued row is untested territory); Page Objects updated.
- **App-reference:** `02-watchlist.md`, a **new** `03-garden-hub/16-ailment-library.md` (the surface currently has NO reference file — mandate), `01-the-shed.md` (major), `36-plant-search.md` (drift fix + new host), `08-modals-and-overlays/04-bulk-search-modal.md` (role change), `08-instance-edit-modal.md` (perm-key drift), `06-data-model-ailments.md`, `00-INDEX.md`.

## 8. Decisions — LOCKED (user, 2026-07-21)

- **Q1:** ✅ **Binoculars + Heart** — 🔭 Watch = this home's watchlist; ♥ Favourite = cross-home personal list. Both on the detail action bar; binoculars also on cards.
- **Q2:** ✅ **Takeover inside /shed** — same `?open=add-plant` deep-link contract, under the Garden-hub tabs, one-blur budget kept.
- **Q3:** ✅ **Hero search + escalation row + persona browse chips.**
- **Q4:** ✅ **ALL 4 STAGES + a 5th**: the Watchlist's "Find an ailment" modal also becomes a library-style full-screen takeover.

### Stage 5 — Ailment-add takeover (added per Q4)

The Watchlist's `AddAilmentModal` (a `max-w-3xl h-[85vh]` dialog deliberately mirroring BulkSearchModal) becomes a full-screen takeover inside the Watchlist tab, mirroring Stage 2's pattern: big search, tiered escalation (library → databases → Rhozly AI → manual) preserved verbatim including `ailment_source` preference + `?open=add-ailment` deep link, StepBuilder manual form as a takeover view. Watching-states on library rows (Stage 1's matcher reused). Files: `AilmentWatchlist.tsx` (the modal is inline there), possibly extracted `watchlist/AilmentSearchTakeover.tsx`. Tour check: grep flowRegistry for add-ailment anchors before building.
