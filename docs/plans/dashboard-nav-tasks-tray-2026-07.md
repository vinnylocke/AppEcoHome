# Dashboard declutter, task-first home & global Today's-Tasks tray — 2026-07

**Status:** PLAN — awaiting approval. No code until the decisions in §7 are made.

## 1. Goal

Follow-on to the home stats+locations redesign (OS 41.0014–41.0019). The user's ask, verbatim intent:

> "We have a cleaner nav bar for phone and the detailed one for PC — do we still need the quick links on the dashboard? They're at the bottom so kind of pointless. Should the task list be at the top as this is one of the more important things? Can we have a tray that comes out and shows today's tasks so no matter what screen you're on you can see the tasks. What other UI improvements like this are worthwhile? Do another deep dive — functional, easy to use, and simple; cut bloat, less AI, useful features easily accessible."

Three explicit asks + an open-ended deep dive. This plan answers all four.

## 2. App-reference files consulted (per the read-first mandate)

- [00-INDEX.md](../app-reference/00-INDEX.md) — surface map
- [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md) — the home composition, posture presets, section loop, QuickActionsRow, compact TaskList embed
- [09-persistent-ui/11-bottom-tab-bar.md](../app-reference/09-persistent-ui/11-bottom-tab-bar.md) — the phone Deck (Home/Plants/Capture/Planner/More)
- [03-garden-hub/04-area-details.md](../app-reference/04-area-details.md) — (adjacent, read during prior stage)
- Cross-cutting to read before implementing: [04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) (ghosts/blueprints — the tray + task-row work), [21-routing.md](../app-reference/99-cross-cutting/21-routing.md) (deep-link gaps), [40-design-system.md](../app-reference/99-cross-cutting/40-design-system.md) + [34-accessibility.md](../app-reference/99-cross-cutting/34-accessibility.md) (tokens, tap targets, can-hover, motion, z-ladder), [09-persistent-ui/01-header.md](../app-reference/09-persistent-ui/01-header.md) (tray trigger), [05-tools/01-tools-hub.md](../app-reference/05-tools/01-tools-hub.md) (Ailment Library tile).

### Verified current state (recon — 3 parallel agents + a 13-agent audit workflow)

- **Home** is one `/dashboard` page composed by `HOME_PRESETS[posture].sectionOrder` (`src/lib/personaPresets.ts`) via one loop in `HomeMain.tsx`. Porch order: `hero → nextBestAction → promo → garden → today → quickActions → learn → brief`. Workbench: `hero → attention → garden → today → brief → week → quickActions → promo`. The array is the single source of truth (inline `order:i`).
- **Today's tasks** render *below the garden grid* on both postures (Porch 5th/8, Workbench 4th/8) — mid-page.
- **Quick Actions row** (`QuickActionsRow`) sits *near the bottom*. Its tiles are user-pinned launcher shortcuts; **almost every destination is already a nav item** — only `/walk` (Garden Walk) is genuinely nav-unreachable. Default new-persona pins are 100% nav-duplicative.
- **Nav** — phone Deck: Home, Plants, [Capture FAB], Planner, More→Shelf. Desktop sidebar: Dashboard, Plants | Planner, Journal | Tools, Integrations, Head Gardener(Evergreen). The Shelf is handed the *full* `navLinks` (re-lists the 3 Deck tabs).
- **App shell** — global overlays mount alongside `MobileNavDrawer`/`CaptureSheet` at `App.tsx ~2276-2307`, each a single instance driven by a `useState` in `AppShell`, portaled to body. `AppShell` already holds `homeId`, `overdueTaskCount`, `locationTaskCounts`, `locations`, `alerts`.
- **Task data** — no shared React context; single app-wide source is `TaskEngine.fetchTasksWithGhosts` (`src/lib/taskEngine.ts`) with a 60s cache + `peekCache()` for instant paint. Every surface fetches independently but shares the cache.
- **Overlays/motion** — no framer-motion; two idioms (tailwindcss-animate vs manual transform). `ModalShell` is the house dialog (portal + focus-trap + shared Escape stack + `sheet` prop). `Z` ladder in `ui/zIndex.ts` is aspirational — most overlays hardcode raw z-values.
- **Keyboard/FAB** — GlobalSearch on Cmd/Ctrl+K & `/`; Help on `?`; `PlantDoctorChat` owns the bottom-right FAB corner (avoid it).

---

## 3. Part A — the three explicit asks (the spine)

### A1. Quick Actions row — cut the bottom-of-page launcher

**Finding:** the launcher grid duplicates the nav bar; the only unique, high-value tile is **Garden Walk** (`/walk`, no other home).

**Approach (recommended, pending §7 Q1):** remove the pinned-shortcut grid from the home and **keep the Garden Walk tile** as a standalone element, relocated (see A2 order). Retire the `quickActions` section from both presets' `sectionOrder`. The customisable launcher catalogue + `/gardener?section=quick-launcher` picker stay in the codebase (harmless), but the home stops rendering the grid.
- Files: `src/lib/personaPresets.ts` (drop `quickActions` from both `sectionOrder`s), `src/components/home/HomeMain.tsx` (render the Walk tile inline where `today`/`garden` now lead; drop the `quickActions` SECTIONS entry or repoint it to a Walk-only block), `src/components/home/QuickActionsRow.tsx` (either slim to the Walk tile only, or lift the Walk tile out and delete the grid usage).
- Alternative (Q1 option B): keep the grid but **slim it to non-nav-reachable actions only** (Walk + maybe Capture verbs).

### A2. Task list at the top — promote `today` above the garden

**Approach:** reorder both presets so tasks lead the page under the hero/first-action:
- Porch: `hero → nextBestAction → today → garden → learn → brief` (promo folds in near hero as today).
- Workbench: `hero → attention → today → garden → brief → week → promo`.
- Garden Walk tile (from A1) sits with the `today`/`quickActions` slot, just above or below the task list.
- Files: `src/lib/personaPresets.ts` only (plus the A1 edits). One array change each — cheap, exactly the "tasks are important" fix.

### A3. Global "Today's Tasks" tray — see tasks from any screen

**New component:** `src/components/tasks/TodayTasksTray.tsx` — a single app-level instance mounted alongside `MobileNavDrawer`/`CaptureSheet` in `AppShell`, driven by a new `trayOpen` `useState`, portaled to body, `null` when closed.

- **Presentation:** right-anchored slide-in on desktop (left is owned by the Shelf), bottom-sheet on narrow — reuse **`ModalShell` with the `sheet`/side variant** (gets portal + focus trap + shared Escape stack + backdrop-close + entrance motion for free) rather than hand-rolling. Z from the ladder (`Z.drawer`).
- **Content:** today's + overdue tasks. Reuse the existing `TaskList` (`compact`) inside the tray so every row keeps its inline complete/postpone/delete — no new task UI. Pull from `TaskEngine.fetchTasksWithGhosts({ startDateStr=endDateStr=todayStr, includeOverdue:true })`; `peekCache()` for instant paint; shares the cache the dashboard already warms (no double-fetch). Optional header: the "X of Y done today" summary (`buildTodaySummary`, already computed in `AppShell`).
- **Trigger:** a header control (checklist icon + `overdueTaskCount` badge) in the persistent header (`App.tsx ~1488-1538`), present on **both** phone and desktop (the header renders on all non-focus routes). **Not** the bottom-right corner (PlantDoctorChat FAB). Optional keyboard shortcut `t` (mirroring the GlobalSearch `isTyping` guard).
- **Scope guard:** tray suppressed in focus mode (matches Deck/Shelf).
- Files: `src/components/tasks/TodayTasksTray.tsx` (new), `src/App.tsx` (state + mount + header trigger), `src/components/ui/zIndex.ts` (add `Z.tray` if needed).
- **New app-reference file:** `docs/app-reference/09-persistent-ui/12-today-tasks-tray.md` (from `_template.md`), + a `- [ ]` row in `00-INDEX.md`, + cross-links from `01-header.md`, `17-home-main.md`, `04-data-model-tasks.md`.

---

## 4. Part B — verified "other improvements" backlog (deep-dive result)

32 verified survivors + 3 critic gaps, tiered by impact/effort. Every item was confirmed against current code; already-shipped/speculative items were cut by the adversarial pass.

### Tier 1 — high value, small/medium effort (recommended for this batch)

| # | Improvement | Cat | Files | Effort |
|---|---|---|---|---|
| B1 | **Real "all done / nothing due" task empty state** (not the generic "Set up a Routine" pitch after you clear your last task); render `size=sm chrome=none` in compact mode | less-ai | `TaskList.tsx`, `shared/EmptyState.tsx` | M |
| B2 | **Relative due-date label per task row** ("Overdue · was due Tue", "Due today", "In 2 days") — overdue is currently colour-only (a11y gap); the tray needs this too | discoverability | `TaskList.tsx` | M |
| B3 | **Task-state colours → `status-*` tokens** so High Contrast works (overdue/today/harvest cards + chips + icons use raw palette that HC ignores) | accessibility | `TaskList.tsx` | M |
| B4 | **Raise sub-44px tap targets** on the most-tapped controls (task complete toggle 32px, select-all 24px, hero chips 36px, add-location chip ~24px) via `pointer-coarse:` bumps | accessibility | `TaskList.tsx`, `home/HomeStatusStrip.tsx`, `home/GardenOverviewGrid.tsx` | S |
| B5 | **Surface the Ailment Library** as a Tools-hub tile + pinnable launcher entry (a whole reference library reachable only from one Watchlist button today) | discoverability | `ToolsHub.tsx`, `quickLauncherCatalogue.ts` | S |
| B6 | **Wire NextBestAction's dead task rung** — the Porch's marquee card never points at your actual pending task (feed `firstTaskTitle` from `peekCache`) | discoverability | `home/HomeMain.tsx`, `home/NextBestAction.tsx` | M |
| B7 | **Stop the Shelf re-listing the 3 Deck tabs** (filter Dashboard/Plants/Planner out of the phone "More" drawer so it shows only true overflow) | bloat | `src/App.tsx` | S |
| B8 | **Remove/wire the dead "Getting Started" menu item** (account dropdown; onClick is a no-op `go('/dashboard')` above a real Help & FAQ) | less-ai | `UserProfileDropdown.tsx` | S |

### Tier 2 — solid, medium effort (candidate for this batch or next)

| # | Improvement | Cat | Files | Effort |
|---|---|---|---|---|
| B9 | **Make recurring tasks visibly recurring** — a "Recurring" pill on ghost/blueprint rows + a recurrence row in TaskModal (core concept is currently invisible) | discoverability | `TaskList.tsx`, `TaskModal.tsx` | M |
| B10 | **Delete the dead `variants` map** in personaPresets (~30 lines; only `.hero` is read, and it just restates posture) | bloat | `personaPresets.ts`, `HomeMain.tsx` | S |
| B11 | **Break up the uppercase eyebrow wall** — 6 identical tiny-grey section captions read "generic AI dashboard"; give 1–2 anchors real hierarchy, drop the rest | less-ai | `home/GardenOverviewGrid.tsx`, `HomeMain.tsx`, `QuickActionsRow.tsx`, `AttentionRow.tsx` | M |
| B12 | **Give Routines a discoverable Planner tab** (flagship feature has no nav home; PlannerHub already reads `?tab=`) | discoverability | `PlannerHub.tsx`, `src/App.tsx` | M |
| B13 | **Automations load-failure error state** — a failed first load currently looks identical to "no automations" | other | `integrations/AutomationsSection.tsx` | S |
| B14 | **Replace `window.confirm()` in the Add Task flow** (discard-changes + duplicate-routine) with in-app confirms; the duplicate-routine case can name the conflict + offer "Edit existing" | less-ai | `AddTaskModal.tsx` | M |
| B15 | **Calendar header: kill "Operational Hub"** subtitle → a live "N tasks this week · M overdue" line | less-ai | `TaskCalendar.tsx` | S |
| B16 | **Surface or delete the orphaned Garden Reports view** (fully built, never mounted; data pipeline is live) — product fork (§7 Q4) | discoverability | `GardenReports.tsx`, `useGardenReport.ts`, `src/App.tsx` | M |

### Tier 3 — consistency/polish cluster (defer to a dedicated pass)

- **Overlay consolidation:** make the `Z` ladder real (renumber + migrate off hardcoded z-values), fold the 6 copy-paste garden bottom-sheets + 2 harvest sheets into `ModalShell sheet`, rebuild `BetaFeedbackSheet` on `ModalShell` (kills the last manual-animation idiom; adds missing focus-trap/Escape/aria), point `MobileNavDrawer` at the ladder + shared Escape stack, route `TaskList`'s hand-rolled postpone/delete overlays through `ModalShell` (merge the two near-identical delete confirms). *(B-overlays: consistency/a11y/bloat, ~M each; strongly related — do together.)*
- **Small polish:** collapse the byte-identical porch/workbench `tasksBlock` ternary; Porch "+N more need attention" affordance; drop Integrations top-level sidebar slot (has a Shelf side-effect — conscious call); fix Dashboard active-state bleeding onto `/management`; Integrations reuse shared `EmptyState`; skeletons instead of bare spinners (Automations, Senescence); Senescence retry-on-error; `can-hover:` guards across TaskList.

### Critic gaps — a "search & deep-linking" theme (recommend as a separate follow-on)

- **G1 — Global Search deep-links to bare lists** and throws away the matched entity (tap a plant → land on the whole Shed). Carry identity through (`?query=`, then `?plant=<id>` etc.). High value.
- **G2 — Core entities aren't URL-addressable** (`?plant=<id>` / `?task=` / `?plan=`); aligns with existing `docs/deep-linking-plan.md`. Unblocks G1 + notifications + The Brief links.
- **G3 — Global Search is data-only** (no actions/destinations layer) — could become a real command palette by indexing the launcher catalogue + quick-add verbs.

---

## 5. Part C — recommended scope & sequencing for THIS batch

Recommend shipping in small, independently-deployed stages (the proven pattern from the last redesign):

1. **Stage 1 — Home reshape (asks A1 + A2):** reorder presets, promote tasks, cut the launcher grid, keep the Walk tile. Cheap, high-visibility. Fold in **B10** (dead variants) and **B11** (eyebrow wall) since they touch the same files.
2. **Stage 2 — Global tray (ask A3):** the new `TodayTasksTray` + header trigger. Fold in **B2** (relative due-date labels — the tray needs them) and **B6** (NextBestAction rung — same `peekCache` wiring).
3. **Stage 3 — Task-row quality:** **B1** (empty states), **B3** (status tokens/HC), **B4** (tap targets), **B9** (recurring pill). All in `TaskList` — one coherent pass.
4. **Stage 4 — Discoverability quick wins:** **B5** (Ailment Library), **B7** (Shelf filter), **B8** (dead menu item), **B12** (Routines tab), **B13/B15** (error state + calendar subtitle). Small, scattered, high ratio.
5. **Deferred (own passes, need a go-ahead):** Tier 3 overlay-consolidation cluster; the search/deep-linking theme (G1–G3); Garden Reports fork (B16).

Each stage: three-tier tests updated, app-reference synced, local test + `npm run build`, then deploy on your approval and push `main` — same discipline as OS 41.0014–41.0019.

## 6. Tests & docs touched (summary)

- **Unit:** `personaPresets.test.ts` (section-order asserts), new `TodayTasksTray` logic if any pure helper, `todaySummary`/date-label helper tests.
- **E2E:** `dashboard.spec` (task-list position, quick-actions removal), a new `today-tasks-tray.spec` (open from header on ≥1 route, complete/postpone inside, focus-mode suppression), `layout.spec` (Shelf no longer lists Deck tabs), `tools`/`planner` specs (Ailment Library tile, Routines tab). Page objects updated.
- **App-reference:** new `09-persistent-ui/12-today-tasks-tray.md`; updates to `17-home-main.md` (order + quick-actions removal + NextBestAction wiring), `11-bottom-tab-bar.md`/`02-sidebar.md` (Shelf filter), `01-header.md` (tray trigger), `05-tools/01-tools-hub.md` (Ailment Library), `04-planner/01-planner-dashboard.md` (Routines tab), the task modals/list refs, plus `00-INDEX.md` row.

## 7. Decisions — LOCKED (user, 2026-07-21)

- **Q1 — Quick Actions row:** ✅ **Remove the launcher grid, keep the Garden Walk tile** (relocated near tasks). Pin catalogue + `/gardener?section=quick-launcher` picker stay in code.
- **Q2 — Task list position:** ✅ **Directly under the hero, above the garden**, on both postures.
- **Q3 — Tray contents:** ✅ **Today + overdue + a quick "add task"** (inline complete/postpone on rows; quick-add opens the existing QuickAddTaskModal). Trigger = header checklist icon + overdue badge, on every non-focus screen.
- **Q4 — Batch scope:** ✅ **Asks + Tier 1 + Tier 2.** Tier 3 (overlay-consolidation cluster) and the search/deep-linking theme (G1–G3) are deferred to their own passes.
  - **B16 (Garden Reports) still needs a surface-vs-delete call** — held out of the build until decided (won't delete something I didn't create, or surface a whole feature, without a go). Will confirm when Stage 4 is reached.

## 8. Finalized staging (locked scope)

1. **Stage 1 — Home reshape:** ✅ BUILT (awaiting deploy). A1 (remove grid, keep Walk) · A2 (tasks under hero, above garden) · B10 (delete dead `variants`) · B11 (eyebrow-wall hierarchy — "Today's tasks" promoted to a real heading, "Your garden" caption dropped; AttentionRow/Brief keep their eyebrows). Files: `personaPresets.ts`, `HomeMain.tsx`, `QuickActionsRow.tsx` (slimmed to Walk-only), `GardenOverviewGrid.tsx`, `App.tsx` (dropped dead `availabilityCtx`), `flowRegistry.ts` (removed the Quick-actions tour step). Tests: `personaPresets.test.ts` (variants asserts → tasks-first/walk asserts, 19 green), `home-main.spec` HOME-005, `quick-access.spec` QUICK-003/004, `quick-calendar.spec` QUICK-CAL-001, `HomeMainPage.ts`. Docs: `17-home-main.md`, `10-localized-task-calendar.md`.
   - **Known consequence:** the `/quick/calendar` planting helper's only in-app entry was the "Today" launcher tile, removed with the grid — it is now **URL-only**. Flagged to the user; re-surface (from the Calendar sub-tab or the Stage-2 tray) is a candidate follow-up, not done in Stage 1.
2. **Stage 2 — Global tray:** A3 (`TodayTasksTray` + header trigger + quick-add) · B2 (relative due-date labels) · B6 (NextBestAction rung). Files: new `tasks/TodayTasksTray.tsx`, `src/App.tsx`, `TaskList.tsx`, `NextBestAction.tsx`, `HomeMain.tsx`, `ui/zIndex.ts`.
3. **Stage 3 — Task-row quality:** B1 (empty states) · B3 (status tokens/HC) · B4 (tap targets) · B9 (recurring pill) · B14 (in-app confirms in Add Task). Files: `TaskList.tsx`, `shared/EmptyState.tsx`, `TaskModal.tsx`, `AddTaskModal.tsx`, `HomeStatusStrip.tsx`, `GardenOverviewGrid.tsx`.
4. **Stage 4 — Discoverability + errors:** B5 (Ailment Library tile) · B7 (Shelf filter) · B8 (dead menu item) · B12 (Routines Planner tab) · B13 (Automations error state) · B15 (Calendar subtitle). Plus the **B16 surface-vs-delete** decision. Files: `ToolsHub.tsx`, `quickLauncherCatalogue.ts`, `src/App.tsx`, `UserProfileDropdown.tsx`, `PlannerHub.tsx`, `integrations/AutomationsSection.tsx`, `TaskCalendar.tsx`.

Each stage: three-tier tests + app-reference synced, local test + `npm run build`, deploy on approval, push `main`.
