# Home screen redesign — stats cull + locations consolidation + anti-AI/bloat sweep

**Status:** Plan — all 4 decisions LOCKED (§G). Awaiting build approval for Stage 1. No application code written.
**User brief (three asks):** (1) the home shows a lot of statistics — useful or bloat? (2) the "Locations" tab overlaps with location management *and* the home garden grid — consolidate into one (ideally the home screen) with easy add/manage of locations + sub-areas; (3) another deep dive to cut bloat, look less AI-generated, and surface useful features.

Grounded by a 4-agent recon deep-dive (stats inventory, locations trilemma, bloat/AI/a11y sweep, technical grounding) + a synthesis pass. Every claim below traces to a `file:line` from that recon. One load-bearing claim independently re-verified by me (the LocationPage permission leak — see §F).

---

## A. App-reference consulted

`02-dashboard/17-home-main.md`, `02-dashboard/02-locations-tab.md`, `02-dashboard/07-location-page.md`, `03-garden-hub/03-location-manager.md`, `03-garden-hub/04-area-details.md`, `07-management/02-members-permissions.md`, `99-cross-cutting/01-data-model-home.md`, `02-data-model-spatial.md`, `19-rls-patterns.md`, `21-routing.md`, `34-accessibility.md`, `40-design-system.md`; plus source end-to-end for `GardenSnapshot`, `GardenOverviewGrid`, `AreaRow`, `LocationOverviewCard`, `LocationTile`, `LocationPage`, `LocationManager`, `AddAreaWizard`, `HomeStatusStrip`, `dashboardStats.ts`, and the App.tsx dashboard branch.

**Doc drift found (fix in-task):** `02-locations-tab.md` still describes the old `LocationTile` grid, but `?view=locations` now renders the same `GardenOverviewCard` stat-quadrant cards as the home grid. `02-data-model-spatial.md` uses `is_outdoor`/`ph`; the columns are `is_outside`/`medium_ph`. `07-location-page.md` claims an Add-Area button + microclimate strip that don't exist.

---

## B. Stats verdict — "a stat earns its pixels only if a gardener would *do something different today* because of it"

### Keep (the good part — the hero, porch sentence, and grid's decision-numbers)
`X/Y today`, `N overdue` (the one duplication that earns itself), current temp+condition, `frost N°`, the porch status sentence, per-location tasks-today chip, AreaRow growth-state dots, soil-sensor chip, valve chip, the 7-day day-strip (**promote** out of the wall), Week Ahead sow/harvest chips, The Brief narrative rows, the nav overdue badge.

### Demote (orientation metadata — must stop competing typographically with decision-numbers)
- Golden-hour/sunset clock — porch whisper-line only; today it sits at peer rank with tasks/frost (`HomeStatusStrip.tsx:239-243`).
- Location subtitle `Outdoors · 3 areas · 12 plants` — must not out-weight the tasks chip (`LocationOverviewCard.tsx:74-76`).

### Cut / merge (grid duplication)
- AreaRow bare plant-count `N` — **cut**; triple-redundant with the dots + subtitle (`AreaRow.tsx:182-184`).
- AreaRow state-breakdown text `3 flowering · 2 seedling` — **cut**; the coloured dots directly above already say this (`AreaRow.tsx:155-159`).
- Per-area tasks chip — **merge**; only show when it disagrees with the per-location chip (`AreaRow.tsx:138-144`).

### The Garden Snapshot stat wall — **gut it, don't tidy it**
Of ~25 tiles in `GardenSnapshot.tsx`, roughly two-thirds are retrospective vanity or duplicate facts the hero/nav/attention-row already own:
- **Cut (vanity/analytics):** Total Tasks, Completed + `%rate`, Done-automatically, Streak, Plants-Harvested + yield, Plants-Pruned/General-Pruning, Weather-Alerts (banner owns alerts by design), Skipped-(rained), all automation tiles, Plant-Doctor-sessions, per-member breakdown.
- **Merge (duplicate of hero/nav/attention/Week-Ahead):** Overdue tile, Pending tile, Harvests-Due, Pruning-Due.
- **Demote:** carried-over/completed-this-week, category chips (nav filters wearing count clothes → Calendar/Routines), Active-Plants (the grid *is* the census), rainfall.
- **Promote out of the collapsed wall:** the **7-day day-strip** → a small forward-looking "week shape" card; **New Watchlist alerts** → an attention-row card (a collapsed panel is the worst home for an alert).

**Net:** the home keeps every number that answers "what now / what next" and sheds the entire scoreboard.

---

## C. Locations consolidation — "the grid is the garden, and you manage it in place"

### The problem
Five overlapping location surfaces. The **Locations tab** (`?view=locations`) is ~90% redundant with the **home garden grid** — both render one-card-per-location from the same App `locations` state and both tap through to the same `?locationId=X`; the grid is a strict superset (areas, growth dots, telemetry). **LocationManager** (`/management`) is the *sole* CRUD owner, so add-location and the only working add-area path (`AddAreaWizard`, one button at `LocationManager.tsx:566`) are buried a route away. Three surfaces gesture at "add an area" but **two are decoys** (they just navigate; LocationPage's empty state literally says "Go to Settings › Location Management").

### Recommended design
Make the **home garden grid the single "what's growing where + manage it here" surface**; retire the redundant Locations tab; give the drill-in the add-area affordance it lacks; demote LocationManager from "only path" to optional power-user bulk view.

```
HomeMain › home-garden-section
  ├─ GardenOverviewGrid
  │    ├─ section header → home-add-location-btn   (gated can("locations.create")) → AddLocationModal
  │    └─ LocationOverviewCard
  │         ├─ header kebab → location-manage-{id}  (Rename / Inside-Outside / Delete)
  │         └─ AreaRow
  │              ├─ area-manage-{id}                (Metrics / Rename / Delete)
  │              └─ area-add-{locationId}           (launches AddAreaWizard IN PLACE)
  └─ home-empty-garden (3-CTA; "Create a location" opens the modal, not a route)

LocationPage (?locationId=) — the detail/edit host
  ├─ + real Add-Area button (wire AddAreaWizard; kills the "go to Management" dead-end)
  ├─ AreaDetails = the single area-metrics + plant editor
  └─ thread usePermissions so env-toggle + area-delete stop being ungated (§F)
```

**Shared extractions first (one code path for both surfaces):** `AddLocationForm` (lift from `LocationManager.tsx:440-480`), one `AreaManageMenu`, one `AddAreaWizard` launcher hook. Because `LocationOverviewCard` headers and `AreaRow`s are single navigation `<button>`s today, every manage affordance is a **nested button with `stopPropagation`** (mirroring `LocationPage.tsx:292-300`).

**Locations tab → retired.** Drop it from the switcher (→ Dashboard / Calendar / Weather), keep the `dashboard-view-switcher` testid (tour step-1 anchor), and make `?view=locations` **fall through to home** exactly like legacy `?view=overview` (App.tsx:513-539). Delete `LocationTile.tsx`.

**`/management` → kept as an optional power-user bulk view** (recommended — see §E Q1). Zero-cost orphan route; uniquely feeds Plant Doctor's garden-layout AI page-context + cross-feature metadata chips; hosts the `add_location_and_area` manual tour. Keep it in the Dashboard nav `matchPaths`; keep `/management?open=add-location` working; also point the home empty-CTA at the new inline modal.

**Runner-up (rejected for now): fully retire `/management` → redirect to `/dashboard`.** Cleaner on paper but forces three load-bearing migrations in the same change (re-home Plant Doctor's garden-layout context, re-anchor the tour + rewrite `home_setup_tips` copy, repoint `?open=add-location` + strip nav matchPaths) for marginal benefit. Retire later as a follow-up once the home owns everything.

---

## D. Bloat / anti-AI / a11y — ranked cuts

1. **[HIGH · one sweep] Adopt the `Card` primitive + `status-*` tokens + green-tinted `shadow-card`.** Every home card hand-rolls `bg-white rounded-3xl shadow-sm border` with four different border recipes; `shadow-sm` is a neutral-black shadow the system forbids (`40-design-system.md:24/81`). One near-mechanical swap re-tints shadows, unifies radius/border, and folds in the hover fix (#8).
2. **[HIGH · a11y] Fix sub-AA contrast on the porch status sentence** — the line that *is* the summary renders at `on-surface/60` ≈ 3.4:1 (`HomeStatusStrip.tsx:235`). Lift to `/80` or solid `on-surface-variant` (~7:1); reserve `/35–/45` for genuinely decorative eyebrows.
3. **[HIGH · a11y] Migrate status chips to `status-*` families** — AttentionRow + AreaRow soil/valve chips use raw Tailwind palette that **bypasses High Contrast mode** (`40-design-system.md:77`) on exactly the cards that flag failed automation / dry soil.
4. **[HIGH · anti-AI] Cut the over-labeling; vary hierarchy** — ~6 identical `font-black uppercase tracking-widest /40` eyebrows over near-identical white cards is *the* template-generated tell. Drop redundant labels ("Your garden" over a location grid), keep a couple as true section headers, let whitespace + card size separate the rest.
5. **[HIGH · buried feature] Raise the task-board entry point** — full task management is behind a faint 11px "See all" link (`HomeMain.tsx:322`) yet ticking tasks is the highest-frequency action. Make it a real button both postures; surface inline complete/snooze on the compact list (see §E Q3).
6. **[MED · anti-AI] Replace the emoji valve icon + generic NBA copy** — `⚠` emoji in a Lucide-only system (`AreaRow.tsx:82`) → Lucide `AlertTriangle`; NBA filler body ("tick it off and you're winning") → carry the actual plant/area name + concrete step, or drop it.
7. **[MED · a11y] Fix the posture toggle** — two 14px icon-only buttons, `title` but no `aria-label`, ~26px target (`HomeMain.tsx:198-219`), under the 44px floor. Add labels, pad to ≥44px, consider `SegmentedTabs`.
8. **[MED · craft] Sweep bare `hover:` → `can-hover:`/`active:` twin** — folds into #1; kills sticky-hover-after-tap on the now-default phone posture.
9. **[LOW · craft] Cap live-animation budget** — multiple `animate-pulse` valve dots exceed the ≤1-live-element budget; static filled dot + "Watering" text suffices. Expose "Ask AI" on the Porch too, or remove (don't gate to power users).

---

## E. Staged build order (each stage ships + verifies independently)

- **Stage 1 — Craft sweep** (Card primitive + status tokens + contrast + hover). **Risk LOW**, near-mechanical, no logic change; resolves D#1/2/3/6-emoji/7/8/9. Testids untouched → dashboard e2e stays green. **✅ DONE 2026-07-20** — card surfaces → house tokens (green `shadow-card`, unified radius/border) across NextBestAction/TheBrief/AdaptiveCare/GardenBrainBrief/LocationOverviewCard/SeasonalPicks/HomeMain-empty; AttentionRow + AreaRow soil/valve + hazard chips → `status-*` families + **added HC-mode `status-*`→`-ink-strong` overrides in index.css** (the migration only delivers HC support with this — verified the block previously handled only on-surface opacities); porch sentence `/60`→`on-surface-variant`; sun line `/35`→`/55`; posture toggle a11y (aria-label/pressed + ≥44px + shadow-card); valve emoji→Lucide AlertTriangle; running-valve dot static; bare `hover:`→`can-hover:` on home surfaces. Verified: typecheck, unit 1555/144, build, home-main e2e 9/9, both postures visually. No testids/labels changed. **Fresh review = ship; fixes applied:** soil_dry attention chip water→caution (blue meant "wet" in AreaRow but "dry" in AttentionRow on one screen — now blue = water present everywhere); hero danger segment `text-red-700`→`text-status-danger-ink` (was bypassing HC); sun line `/55`→`/70` (now ~5.9:1, clears AA); inner-button bg/opacity hovers (empty-garden CTAs, AdaptiveCare, GardenBrainBrief) → `can-hover:` + `active:`. Left as-is: low_battery/automation_failed both `caution` (icons distinguish).
- **Stage 2 — Gut the stat wall.** **Risk LOW–MED.** Delete vanity+duplicate tiles; promote day-strip → standalone card; route watchlist alert → attention row. Do **not** add a second `useHomeDashboardStats` consumer (uncached edge fn). Cull `dashboardStats.test.ts` against tested semantics. **✅ SHIPPED 2026-07-20 — as a PURE DELETION.** The "promote the day-strip → standalone card / route watchlist → attention row" promotions above were **SUPERSEDED** by the locked §G Q2 decision: the ENTIRE wall (all tiles, `dash-cat-*` chips, member breakdown, `dash-snapshot-toggle`, **and** the 7-day day-strip) was deleted from the home with **nothing relocated**. `GardenSnapshot.tsx` deleted; `personaPresets.ts` dropped the `snapshot` section id + `snapshotOpen` field (Workbench `sectionOrder` now ends `… → week → quickActions → promo`; `WORKBENCH_ASIDE_SECTIONS = {brief, week}`); `home-dashboard-stats` edge fn **kept** (still feeds the "X of Y done today" summary + walk gate). Tests: DASH-050 + NAV-001 e2e retired, `personaPresets.test.ts` snapshot assertions dropped (unit 1555→1554/144). Docs synced (`17-home-main.md`, `05-`/`30-` test plans, `15-weekly-overview.md`, `01-dashboard-tab.md`, `00-INDEX.md`, `TESTING.md`).
- **Stage 3 — Grid trim + telemetry dedup.** **Risk LOW.** Cut AreaRow bare count + state-text; merge per-area tasks chip; demote subtitle + golden-hour typographically.
- **Stage 4 — Locations consolidation.** Split into **4a** (retire tab) + **4b** (inline manage) for safe, independently-shippable slices.
  - **Stage 4a — Retire the Locations tab. ✅ DONE 2026-07-20.** App.tsx: dropped `"locations"` from the `DashboardView` union + BOTH allowlists (the `?view=` parser AND the localStorage-restore allowlist) so `?view=locations` falls through to home exactly like `?view=overview`; removed the `Locations` entry from the 3-tab switcher (kept `dashboard-view-switcher` testid = tour step-1); deleted the whole `dashboardView === "locations"` render branch + the `LocationTile` import + the dead `MapPin` import; **deleted `src/components/LocationTile.tsx`** (its only consumer). Specs: DASH-MOBILE-001 → 3 tabs (+ asserts Locations count 0); retired DASH-020/021/022 (grid rendering covered by HOME-002) and repointed DASH-023 to the garden-grid card drill-in; removed `DashboardPage.gotoLocations()` + `locationTile()`; fixed a stale `?view=locations` mock route. Verified: typecheck + build. Users still add locations via `/management` + the empty-garden CTA until 4b lands.
  - **Stage 4b — Inline add/manage on the grid. ✅ DONE 2026-07-20.** NEW `src/lib/locationMutations.ts` (create/rename/setEnvironment/delete — the ONE DB path, now shared by the home grid AND LocationManager, whose 4 handlers were refactored to call it; +4 unit tests). NEW `AddLocationSheet` (ModalShell add-location form) + `LocationManageMenu` (per-card kebab → action sheet: rename/inside-outside/delete). Grid: `home-add-location-btn` gated `can("locations.create")`; card: `location-manage-{id}` kebab gated `can("locations.edit")`/`can("locations.delete")` (renders nothing for a viewer). Card header restructured so the drill-in button + kebab are SIBLINGS (no button-in-button). Refresh: App passes `onLocationsChanged={handleHomeDataRealtime}` → HomeMain → grid/card; every success refetches. Empty-garden "Create a location" CTA repointed to the inline sheet. e2e: HOME-015 (owner add→appears→delete round-trip) + HOME-016 (mocked viewer → no add btn/kebab — the security gate). Verified: typecheck, unit 1558/145, build, e2e 3/3, visual (kebab→sheet→3 gated actions, no accidental drill-in). **Fresh review (escalated, permission-sensitive) found + I FIXED a CRITICAL bypass:** the empty-garden "Create a location" CTA — repointed from `/management` (gated at the destination) to the inline sheet — was left UNGATED (HomeMain had no `usePermissions`), so a viewer on an empty-garden home could create a location. Fixed BOTH ways (defense in depth): gated the empty-garden button with `can("locations.create")` AND added an in-sheet `can()` re-check in `AddLocationSheet.handleSave` so no trigger can ever open an ungated create. + a unit test (AddLocationSheet: denied `can` blocks `createLocation`). Also fixed a minor UX finding (Delete now closes the action sheet before opening the confirm). Everything else in the stage the review confirmed airtight (kebab gating, shared lib, LocationManager refactor, refresh, modal lifecycle).
- **Stage 5 — Drill-in becomes the edit host: wire AddAreaWizard + close the permission leak. ✅ CORE DONE 2026-07-20.** **CLOSED the verified §F permission leak:** `LocationPage`'s indoor/outdoor toggle (`handleToggleEnvironment`) and per-area delete (`handleConfirmDeleteArea`) were UNGATED — now gated `can("locations.edit")` / `can("areas.delete")` on both the handler (defense in depth) AND the rendered control (a viewer sees a read-only environment badge + no delete buttons). **Wired AddAreaWizard onto the drill-in** — a `can("areas.create")`-gated "Add area" button (header `location-add-area-btn` + empty-state `location-add-area-empty-btn`) opens the wizard in place, **killing the "Go to Settings › Location Management" dead-end**. LocationManager's existing wizard entry left intact (recon's don't-remove-until-tested rule). e2e: LOC-020 (owner opens wizard, dead-end gone) + LOC-021 (viewer → no env toggle / add-area / delete). Verified typecheck+build+unit 1561+visual.
  - **Escalated review (round 1) found the drill-in's CHILD `AreaDetails` had its own ungated writes** (area-metrics edit `areas.edit`, plant delete `shed.delete`, archive/restore/config `shed.edit`, bulk) — GATED all (button + handler). **Round-2 re-review found THREE more** ungated viewer-reachable paths on the same component — CLOSED all: Link-Ailment (`ailments.add`), Scan-Area + AI recommendations (`areas.edit`), and `InstanceEditModal` (`shed.edit`) which auto-opened from the `?instanceId=` URL param bypassing the gated launch button. Each gated at the button/auto-open AND the modal's own commit (defense in depth). + AddAreaWizard `commit()` self-gate. e2e LOC-022 covers the AreaDetails viewer read-only state. **The §F "leak" was really a family of ungated spatial/shed/ailment writes across the whole drill-in edit host — now uniformly `can()`-gated.**
  - **Q4 RESOLVED (user, 2026-07-21): LEAVE LocationManager's Area-Metrics modal as-is.** On inspection it's a ~300-line tabbed editor that also feeds Plant Doctor AI page-context — a risky refactor for a *dedup* benefit, not a defect. The drill-in `AreaDetails` is already the canonical metrics editor (Q4's intent substantially met); LocationManager keeps its modal as a working power-user path in `/management`. Not retiring. Both editors now share the same gating + (for locations) the `locationMutations` lib, so the duplication is low-risk. Revisit only if it causes real friction.

---

## F. Verified security finding (raises Stage-5 importance)

`LocationPage.tsx` has **no** `usePermissions` import and directly mutates `is_outside` at line 141 with **no `can()` check**; `LocationManager.tsx` correctly gates every mutation. RLS enforces only home-membership, not the spatial permission keys (`19-rls-patterns.md`), so the client gate is the only gate — a viewer/member can currently flip a location's indoor/outdoor flag (which drives weather-rule applicability). Stage 5 closes this; the consolidation must not widen it.

---

## G. Decisions — LOCKED (user, 2026-07-20)

1. **`/management` → KEEP** as an optional power-user bulk view (recommended path). No redirect; nav `matchPaths` + `?open=add-location` + the `add_location_and_area` tour all stay intact.
2. **Culled stats → DELETE OUTRIGHT.** No relocation to `/gardener?tab=stats`. The vanity *and* retrospective tiles (streak, %rate, doctor-sessions, per-member, yield, harvest/prune totals, automation counts, etc.) simply disappear from the home. Only the 7-day day-strip is promoted (→ standalone forward-looking card) and New Watchlist alerts route to the attention row. **→ Simplifies Stage 2 to a pure deletion + two promotions (no stats-tab wiring).**
3. **Porch task actions → INLINE complete/snooze on the home's compact list** (recommended). Accepts a little task-mutation back on the home; the compact `TaskList` already owns the complete/snooze logic, so it's an exposure change, not new logic. **→ Folds into Stage 3 (now "Grid trim + home task-list accessibility").**
4. **Single area-metrics editor → `AreaDetails` (the drill-in).** LocationManager's separate Area-Metrics modal retires in Stage 5.

### Stage adjustments from the locked decisions
- **Stage 2 — Gut the stat wall (now pure delete). ✅ DONE 2026-07-20.** Per the locked Q2 choice ("delete everything outright, don't relocate anything"), `GardenSnapshot.tsx` was **deleted entirely** — all ~25 tiles + category chips + member breakdown + collapse toggle **and the 7-day day-strip** — with **NO relocation** (this supersedes the earlier "promote the day-strip / route the watchlist to the attention row" recommendation; nothing was promoted or relocated). `snapshot` left the `HomeSectionId` union + the workbench preset + `WORKBENCH_ASIDE_SECTIONS` (now `{brief, week}`); `snapshotOpen` removed from `HomePreset`. `useHomeDashboardStats` KEPT in HomeMain (still feeds the today summary + walk gate; narrowed to `{ stats }`). `home-dashboard-stats` edge fn left unchanged (still needed for those fields; payload-shrink deferred). Retired specs: DASH-050 + NAV-001; personaPresets.test dropped snapshot assertions. Verified: typecheck, unit 1554/144, build, e2e home-main 9/9 + nav-deeplinks green, Workbench visually decluttered.
- **Stage 3 — Grid trim + home task-list accessibility. ✅ DONE 2026-07-20.** AreaRow: **cut** the bare plant-count number + the growth-state breakdown text (both restated the coloured dots / the location subtitle) + the dead `stateBreakdown()` helper. **Kept** the per-area tasks chip (`home-area-tasks-chip` — actionable "which bed", not pure duplication; the "merge-only-when-disagrees" idea was too fiddly for the value) and the location subtitle (already low-weight). Task board: the entry point is now a **real pill button in BOTH postures** (was a faint Porch text link) via a shared `taskBoardLink()` helper — inline complete/snooze were **already present** on every compact `TaskList` row (left checkbox + CalendarClock Postpone + delete), so Q3 needed no new mutation code, just a prominent entry + a regression test. Made the compact list's internal "View calendar →" footer **opt-out** via a new `hideCalendarLink` prop — HomeMain passes it (its header button is the non-duplicate); `/quick/calendar` (LocalizedTaskCalendar) **keeps** the footer as its only hop to the full week board. New e2e **HOME-014** guards the home's inline actions. **Fresh review = ship after 2 fixes (applied):** (a) added an `sr-only` per-area plant count in AreaRow — cutting the visible count left the quantity invisible to assistive tech (the dots are `aria-hidden`); (b) the footer became opt-out rather than a global delete, which had regressed `/quick/calendar`'s only calendar link. Verified: typecheck, unit 1554/144, build, e2e home-main 10/10, both postures visually cleaner. Risk was LOWER than planned — no task-mutation code added (it pre-existed).
- **Stages 1, 4, 5** unchanged from §E (with `/management` kept per Q1 and `AreaDetails` as the sole metrics editor per Q4).

---

*On approval this plan drives 5 staged PRs; each cites the app-reference files in §A before implementation, ships with the mandatory three-tier tests + doc updates, and gets a fresh review + your deploy go-ahead per project convention.*
