# Garden Hub Search-First Overhaul — Plants · Watchlist · Nursery · Senescence

**Status: approved 2026-07-21 — all four owner decisions locked as recommended (weather strip app-wide; Nursery promoted to 4th tab; "Add it anyway" naming; one search only, no grid text-filter fallback). Building stage by stage, deploy-then-continue.** Follow-on to `docs/plans/ailment-library-shed-search-overhaul.md` (OS 41.0025–41.0029). Direct response to user feedback on the shipped takeovers: search still sits too low (keyboard covers typing), results too small, too much chrome, ailment results lack detail parity, and the hub as a whole (Plants, Ailments, Senescence, Nursery) needs to be "very simple, very clean, very clear".

## 1. The problem — measured, not guessed

Playwright audit at 390×844 (iPhone-class viewport), 2026-07-21:

| Finding | Measurement |
|---|---|
| Controls above the Plants landing search bar | **26 interactive elements** |
| Plants landing search input | y=537 — an iOS keyboard (~336px) leaves ~508px visible → **input under the keyboard while typing** |
| "Find a plant" takeover input | **y=601** (worse than the landing it replaced) — above it: app header 90px, 3 weather pills 150px, hub tab strip 44px, back link, icon+title, 2-line subtitle, Search\|Manual tabs, PASTE A LIST |
| Results visible after typing a query in the takeover | **0** (all below the fold); suggestion pills 27px tall |
| Watchlist landing search input | y≈738 — pinned against the bottom nav under **8 chrome blocks** |
| Ailment takeover input | y=523; result rows **not tappable** — no detail parity with plants |
| Senescence row actions | 36px (below the 44px pointer-coarse floor) |
| Nursery | buried behind a Plants\|Nursery toggle **while the page still shows "Plants 16 / Your Shed" + "Find a plant"** (mismatched header); no search at all; first packet card ~y=690 |
| Weather alerts | ~150px stack repeated on every hub tab and above both takeovers |

Root cause: every tab re-implements its own title/subtitle/CTA/scope/status/filter/search stack, takeovers render *inside* the hub chrome instead of over it, and the app-level "compact" weather bar isn't compact.

## 2. Grounding

**App-reference consulted** (this batch + the immediately preceding overhaul, plus a fresh full-source recon of `GardenHub.tsx`, `TheShed.tsx`, `AilmentWatchlist.tsx`, `AilmentLibrary.tsx`, `garden/SenescenceTab.tsx`, `nursery/NurseryTab.tsx` + children, `shed/PlantSearchTakeover.tsx`, `shared/PlantSearch.tsx`, `App.tsx` weather-bar mount, `onboarding/flowRegistry.ts` anchors):

- `docs/app-reference/03-garden-hub/01-the-shed.md`, `02-watchlist.md`, `16-ailment-library.md`, `04-bulk-search-modal.md` (+ senescence/nursery files in `03-garden-hub/`)
- `docs/app-reference/09-persistent-ui/36-plant-search.md`
- `docs/app-reference/99-cross-cutting/21-routing.md`, `30-onboarding-state.md`, `27-weather.md`, `12-notifications.md`, `40-design-system.md` / `docs/DESIGN.md`

**Design authority:** merged output of a 5-agent design panel (research vs Material 3 search spec / Apple HIG Searching / NN/g progressive disclosure / Baymard mobile filtering; three independent proposals — mobile-minimalist, information-architect, gardener-workflow; adversarial merge with 12 explicitly resolved disagreements). Key standards applied: on phones a search bar must open a **full-screen search view** (M3 — never docked on compact); input anchored top with `100dvh` (keyboard-safe); 72px two-line result rows; one filter affordance with applied-count badge; one primary action per screen.

## 3. Target design

### 3.1 Hub structure — 4 first-class tabs

`Plants | Watchlist | Nursery | Senescence` (Nursery promoted; order keeps the two Shepherd-anchored tabs in slots 1–2). The Plants\|Nursery segmented toggle (`shed-view-toggle`) dies — verified non-contractual (no tour anchor, no e2e PO dependency that can't be updated in-task). `?tab=nursery` is additive on the existing `?tab=` contract; the phantom "Plants" header over the Nursery disappears structurally.

`GardenHub` becomes sole owner of tab-body layout (`px-4 pt-4 pb-28 md:px-8 md:pb-8`); tabs stop self-padding. Z/sticky ladder: hub tab strip (sticky, z-10, **the screen's one blur — unchanged**) → per-tab sticky search row (opaque, z-10 in scroller; TheShed's second z-20 sticky layer deleted) → bulk action bar (z-30) → search takeover (`fixed inset-0 z-40`, opaque) → modals/sheets (z-50).

### 3.2 Shared `HubHeader` primitive (new: `src/components/garden/HubHeader.tsx`)

Per tab, top to bottom:
1. **Title row** (scrolls away): title `text-xl font-semibold` + muted count + one ⋯ overflow button (44×44). Subtitles die; new/null persona gets max one guidance line, experienced gets none.
2. **Search row** (sticky, opaque): a 52px **launcher** — a button styled as a search field (this *is* the renamed CTA the user asked for: the "add" button becomes the search bar itself) + a 44×44 Filters button with applied-count badge. On tap the launcher opens the full-screen takeover.
3. **Chip row** (scrolls away): the tab's primary browsing axis inline, ragged-left; applied sheet-filters appear as clearable × chips.

Filters = bottom sheet, batch-apply ("Show N results"), not instant-apply.

### 3.3 The search takeover — one shared surface, plant + ailment modes

- `fixed inset-0 z-40` opaque overlay inside the router tree. **Covers app header, weather strip, hub tabs.** Grid stays mounted underneath — the early-return pattern and its scroll save/restore code are deleted (scroll survives for free; `shed-plant-list` tour anchor becomes *more* stable).
- **Top bar (~108px total):** Row 1 = back chevron (44×44, `shed-search-back`/`ailment-add-back`) + autofocused input (flex-1 × 52px, clear-×) + cart button with badge (plant mode; opens the existing review step). Row 2 = Search\|Manual segmented (`bulk-search-tab-*` — Shepherd anchor survives) + "Add a whole list" text button (relocated `shed-bulk-paste-btn`). **Input top edge ≈ y=56–64** (vs 601/523 today). With keyboard open: ~400px of results ≈ **5 full rows** (was zero).
- **Result rows — identical anatomy both modes (the parity fix):** 72px, 56×56 thumbnail (`SmartImage` / ailment kind-glyph tile), name 16px semibold + 14px muted second line, trailing 44×44 **+** button. **Row body tap → detail** (plants: `PlantDetailModal` via `?plant=`, unchanged; ailments: the AilmentLibrary detail content — extracted from `AilmentLibrary.tsx` into a shared `AilmentDetailContent`, rendered as a z-50 modal from search and unchanged as the library's full page). **Trailing + → add** (plants: cart; ailments: instant watchlist add + check morph).
- **Two result sections, one query:** `IN YOUR SHED` / `ON YOUR WATCHLIST` (local matches — this absorbs the tab-level filter-search entirely) then `FROM THE LIBRARY` / `FROM THE FIELD GUIDE` (provider results; the landing provider banner becomes one muted footer line here).
- **Pre-query state:** recent searches (48px rows); new-persona example rows; ailment mode adds a "Browse the field guide" row (absorbs the browse-library button).
- **Escalation ladder (the funnel dies):** at most two quiet result-styled rows appended at list end — "Search wider" (existing escalation testids kept) then "Add it anyway" (sub-line "We'll write up the care details for you") only after wider search is exhausted. Zero-match: "Nothing called '{query}' yet." + ladder + "Enter it manually".
- Keyboard engineering: `100dvh`, no fixed-bottom controls inside the overlay, `visualViewport` recheck after keyboard dismissal; verify Capacitor Keyboard resize mode on device.
- Escape-guard, cart/review/import logic, `?open=add-plant&query=`, Doctor/Planner `state.autoImport→review`: all byte-identical.

### 3.4 Per-tab landings

- **Plants:** title row ("Plants" + count + ⋯ holding Select mode & Garden layout) → sticky launcher "Search plants…" (`shed-add-plant-btn` + tour anchor live here) + Filters badge → chip row All · Favourites · Archived (`?scope=favourites` → Favourites chip). Controls above search: **26 → 7**. First card ~y=330.
- **Watchlist:** launcher "Search pests & diseases…" (`watchlist-add-btn`); chip row **All · Pests · Diseases · Invasive** (type = the gardener's primary axis); Favourites/Archived into the Filters sheet; ⋯ holds "Add several at once" + "Browse the field guide". 8 blocks → 3 rows.
- **Nursery (promoted):** own header "Nursery" + count; **real inline search** (data is local — no takeover), `nursery-search-input` (new); primary "Add seeds" button → action sheet Scan a packet / Paste a list / Type one in (existing `nursery-scan/paste/add-packets` testids move onto sheet rows). First packet ~y=330 (was ~690).
- **Senescence (minimal touch):** keep as-is; fix 36→44px actions + adopt shared padding.

### 3.5 Weather strip (app-level, gated by owner decision)

`WeatherAlertBanner compact` collapses N≥2 alerts into one 44px tappable strip ("⚠ 3 weather alerts · {worst headline}") that expands in place to today's pill list; per-pill dismissal logic untouched; `global-weather-alert-bar` testid stays. Reclaims ~106px. Blast radius: every padded screen.

### 3.6 Naming (verb-led, per user direction)

| Today | Target |
|---|---|
| "+ Find a plant" button | Launcher placeholder **"Search plants…"** (the button *is* a search bar) |
| "Find an ailment" | **"Search pests & diseases…"** |
| "PASTE A LIST" | **"Add a whole list"** |
| "Search more databases" | **"Search wider"** |
| "Create with AI" | **"Add it anyway"** + sub-line (owner Q3) |
| SCAN / PASTE / ADD | **"Add seeds"** → Scan a packet / Paste a list / Type one in |
| Watchlist "Bulk add" | **"Add several at once"** (⋯ menu) |

## 4. Stages (each independently shippable; deploy-then-continue)

1. **Plant takeover rebuild** — ✅ **BUILT 2026-07-21.** Overlay `fixed inset-0 z-[60]` (app header is sticky z-50 — the panel's z-40 lost the paint war, caught live), grid stays mounted (early-return + scroll save/restore deleted), host-owned input at **y=8** (was 601) via new `PlantSearch` `controlledQuery` + `tapOpensDetails` props, 72px rows with 56px thumbs + separated 44px `+` (`{rowTestId}-add`), row tap → `PlantDetailModal`, top-bar basket = `bulk-search-review` (renders only when cart non-empty — matches the e2e count-0 contract), "Add a whole list" in the utility row, recents (`rhozly.recent-plant-searches`) + persona example idle rows, Escape ladder gains clear-query step, ladder renamed + sequenced ("Search wider" → "Add it anyway" only after wider exhausted). **Owned-plants "IN YOUR SHED" section deferred to Stage 3** (it replaces the landing grid-filter; `selectedPlant` opens the assignment modal, not detail — wiring belongs with the landing diet). NEW seed `17_plant_library.sql` (Tomato/Lavender/Sunflower 910001-3; local table was EMPTY — the real cause of every "no results" audit shot). e2e: SHED-020/022a updated to the new contract, SHED-TKO-003 added (keyboard-safe + occlusion + Escape ladder); shed-crud 45 passed / 1 self-skip / 1 flaky-pass (untouched BulkPaste modal).
2. **Ailment takeover parity** — ✅ **BUILT 2026-07-21.** Same overlay shell (`fixed inset-0 z-[60]`, pinned input at y=8 — was 523); the detail body extracted to `ailments/AilmentDetailBody.tsx` (rendered by BOTH the library's `?ailment=` page and the new `ailments/AilmentDetailModal.tsx` at z-[100]); result rows 72px with row-tap → field-guide detail (`ailment-library-open-<id>` new) + trailing Add/Watching button (testid kept); ladder → quiet rows ("Search wider"; **"Search with Rhozly AI" kept search-verbed** — the ailment AI tier searches, it doesn't create, so the plan's "Add it anyway" label doesn't apply; deviation noted); idle "Browse the field guide" row; Escape gains query-clear step; grid stays mounted (early-return deleted). **CRITICAL catch (live): PullToRefresh's scroller keeps a residual `transform` after any pull → it becomes the containing block and traps `fixed` overlays inside the content area.** All three overlay surfaces (plant takeover, ailment takeover, detail modal) now `createPortal` to `document.body` — this also fixed the same latent bug in shipped Stage 1. e2e: WL-TKO-003 added; WatchlistPage `addModalHeading` repointed to the pinned input (the title died by design).
3. **Landing chrome diet** — ✅ **BUILT 2026-07-21.** New `garden/HubHeader.tsx` (title-row + ⋯ overflow + sticky launcher/Filters); Plants landing: mega-h1/subtitle/4-button cluster/double toggle → HubHeader + ONE chip row (Active·Favourites·Archived, role=tab names kept for POs; `shed-scope-home/-favourites` testids preserved; applied-filter × chips), Filters → bottom sheet (portal z-[70], `shed-filters-panel` kept, "Done — N plants"), landing grid-filter + escalation row + provider banner REMOVED (searchQuery state stripped end-to-end), browse chips re-homed to the takeover idle (remount-key seeding); "In your Shed" owned section added to the plant takeover (`ownedPlants`/`onOpenOwnedPlant` → PlantEditModal) and "On your watchlist" to the ailment takeover (`ownedAilments`/`onOpenOwnedAilment` → watchlist detail). Watchlist landing: same primitive; chip row = All·Pests·Diseases·Invasive·♥Favourites·Archived (DEVIATION from the sheet-buried Favourites — it's a view switch, not a filter, and FAV-WL specs click it inline); bulk-add + browse-library → ⋯ menu; landing search input removed (search state stripped; **WL-003's long-standing failure root-caused here: the empty-state title had lost its trailing period** — restored). Senescence actions 36→44px; tour step retitled "One search for everything". **DEVIATION: GardenHub padding ownership deferred to Stage 4** (padding must be re-cut when Nursery becomes a tab anyway; HubHeader's full-bleed sticky row works against the tabs' existing p-4/md:p-8). e2e: SHED-010–014 + S3-001/002 + MOBILE-001 + WL-022/023 + MOBILE-001 + AILIB-003 rewritten to the one-search/⋯-menu contracts; PO helpers openFilters/closeFilters/openOverflowMenu/openBulkAdd updated.
4. **Nursery promotion** — 4th tab, `?tab=nursery`, own header + local search + "Add seeds" sheet, toggle deletion, 320px tour-scroll re-verify. Files: `GardenHub.tsx`, `nursery/NurseryTab.tsx`, `TheShed.tsx`.
5. **Weather strip collapse** — last, app-level, gated on owner Q1. Files: `App.tsx`, `WeatherAlertBanner.tsx`.

Every stage: Vitest + Playwright updates (POs: ShedPage, WatchlistPage; new rows in `docs/e2e-test-plan/06-shed.md`, `11-watchlist.md`, `36-*`), fresh code-review, typecheck + build + unit green before deploy.

## 5. Contract preservation (full table in panel spec)

All load-bearing testids survive in place or on their functional successor (never renamed): `shed-add-plant-btn` → plants launcher; `watchlist-add-btn` → watchlist launcher; `bulk-search-tab-*`/`bulk-search-review`/`bulk-search-start-import` unchanged in the overlay; `shed-select-mode-btn`/`shed-open-layout-btn` → ⋯ menu items; nursery testids → sheet rows. Shepherd anchors: `garden-hub-tab-shed`/`-watchlist` stay slots 1–2; `shed-plant-list` untouched; `bulk-search-tab-manual` in overlay row 2. URL contracts (`?tab=`, `?scope=favourites`, `?open=add-plant&query=`, `?plant=`, `?ailment=`) honoured; additions are additive. Blur budget: hub strip only. Escape guards unchanged.

**Risks:** overlay must render inside the router/providers (no body portal) and coexist with `PullToRefresh` (Stage 1 verify); iOS keyboard/`visualViewport` behaviour needs on-device sanity check; e2e specs asserting the old two-axis pill rows need same-task PO updates; Watchlist type-pills currently drive counts — chip row keeps them.

## 6. App-reference files to update (per stage)

- `03-garden-hub/01-the-shed.md`, `02-watchlist.md`, `16-ailment-library.md`, senescence + nursery files — landing + takeover rewrites, Nursery promotion, tab-set change
- `09-persistent-ui/36-plant-search.md` — overlay host pattern, two-section results, ladder
- `99-cross-cutting/21-routing.md` — `?tab=nursery`; `30-onboarding-state.md` — tour copy/anchor notes; `12-notifications.md` + `27-weather.md` — alert strip; `40-design-system.md` — HubHeader + overlay patterns
- `00-INDEX.md` — any retitled rows

## 7. Owner decisions — LOCKED 2026-07-21

1. Weather strip: **app-wide** collapse.
2. Nursery: **promoted to 4th hub tab**; Plants|Nursery toggle deleted.
3. Escalation CTA: **"Add it anyway"** (sub-line carries the generated-content signal; plant keeps its AI source badge).
4. Grid narrowing: **one search only** — typed queries live in the takeover's "In your Shed" section; no grid text-filter fallback.
