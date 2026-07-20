# Phase 6 — Two-Handed Rhozly: garden companion on phone, garden studio on desktop

**Status:** Plan — awaiting approval. No application code written yet.
**Follows:** `docs/plans/hyperplexed-ui-craft-overhaul.md` (Phases 0–5, all shipped through Rhozly OS 41.0005).
**North star (user's words):** "look even less AI generated… easily useable, not overwhelming to new users… not hard to find what people want… we now have 2 nav bars which doesn't seem great… a unique experience on phone and a different experience on PC… easy to use in the garden with your phone, but set it up / fine-tune / get creative on the bigger screen… smart, techy, and natural… really feel like the Rhozly theme."

---

## 1. The problem, grounded in the live UI

Captured via Playwright against the running app (mobile 390px + desktop 1440px), corroborated by a 5-agent code audit:

1. **Two nav bars on phone at once.** On a phone the app shows a **left green icon-rail** (the sidebar, permanently collapsed to `w-20`) *and* the **bottom tab bar** simultaneously. The rail steals ~60–80px of a 390px screen and duplicates Home/Plants/Planner/Tools. Root cause is one line: the `<nav>` sidebar renders whenever `!isFocusMode`, and `sidebarIsCollapsed = isMdBreakpoint ? isNavCollapsed : !isMobileSidebarOpen` resolves to a permanent icon rail on mobile. `BottomTabBar` is `md:hidden` and never coordinates with it. *(App.tsx:1390, 1498–1503; BottomTabBar.tsx:41.)*
2. **Chrome buries content on phone.** On mobile `/shed`, six stacked control rows (tabs → title → button row → Plants/Nursery → Home/Favourites → search → Active/Archived → filter → a promo callout) push the actual plants below the fold — while the left rail eats width the whole time.
3. **Desktop wastes its canvas.** The dashboard body is wrapped in `grid grid-cols-1 lg:grid-cols-12` but the *only* child is `col-span-full` — the 12-col grid is **dead code**. So `/dashboard` and `/planner` render as a single narrow column pinned left with ~60% of a 1440px screen empty. A phone layout stretched onto a monitor — the opposite of "set it up and get creative on the bigger screen." *(App.tsx:1670–1672.)*
4. **Loud first-run.** A large blue "Want a daily watering reminder?" promo card competes with the green brand and shouts at brand-new users the moment they land — plus the historical "up to 5 stacked promo cards / add-plant traverses 4 stacked modals" noise.
5. **Same layout everywhere.** Apart from the nav shell, `QuickAccessHome`, and `GardenLayoutEditor`, every surface is one naive responsive layout that reflows columns without changing *responsibility* or *density* by platform — so the user's phone-vs-desktop intent is lost.

---

## 2. App-reference files consulted

- `docs/app-reference/09-persistent-ui/02-sidebar.md`, `11-bottom-tab-bar.md`, `01-header.md` — the nav shell contract.
- `docs/app-reference/99-cross-cutting/21-routing.md` — focus-mode, redirects, `/`→`/quick`|`/dashboard`.
- `docs/app-reference/99-cross-cutting/40-design-system.md` + `docs/DESIGN.md` — tokens, motion law, brand.
- `docs/app-reference/00-INDEX.md` — full surface inventory for the responsibility matrix.
- Per-surface refs for the surfaces that will diverge (dashboard, shed/garden-hub, planner, blueprint-manager/Routines, plant-doctor, journal hub, garden-layout, integrations, head-gardener).

---

## 3. Chosen architecture — "Trellis spine, two fittings"

A trellis is one frame that looks different against a wall than freestanding — but it's the same structure. **One canonical navigation spine** (a single ordered destination array with the existing Garden / Plan / AI & Tools groups) is *projected* into platform-specific fittings, rather than shipping two nav systems that drift apart:

- **Phone = the garden companion (in your hand, in the bed).** One primary nav: the **bottom Deck** for the daily loop, plus a **Shelf** (the existing focus-trapped `MobileNavDrawer`, promoted out of focus-mode) for the long tail. The left rail is gone. The header de-crowds. Surfaces default to Simple density and lend their dominant action to the bar. You tend and capture.
- **Desktop = the garden studio (at the bench).** One primary nav: the collapsible left **rail** (no bottom bar). The dead `lg:grid-cols-12` becomes a real split; card-walls become master-detail; the creative canvases (Planner, Routines builder, Integrations, Head Gardener) finally get their width. You build, configure, design.

Same green (#075737), same `@theme` tokens, same data model, same compositor-only motion law — **opposite postures.** The metaphor decides *what each surface is for* on each device, not just how it reflows.

*(This is proposal "Trellis" as the spine, grafting "Garden & Studio"'s build primitives — Capture FAB via the existing `quickLauncherCatalogue`, shared `PageWithRail`/`MasterDetail` — and "Trowel & Table"'s change-of-responsibility principle: the phone Care surface can log an ailment but not bulk-edit; the desktop Design surface can't pretend to be a camera.)*

---

## 4. Surface responsibility matrix

| Surface | Posture | Phone | Desktop |
|---|---|---|---|
| Dashboard `/dashboard` | **Both** | Simple density: today's tasks, overdue chip, the one weather alert, quick actions | Detailed: primary col (Brief + TaskList + garden grid) + persistent right rail (weather/alerts, Head Gardener, Week Ahead, Snapshot) |
| Plants / Shed `/shed` | **Both, phone-leaning** | Fast lookup, single-plant actions, one-tap "log ailment", collapse the toolbar stack | Master-detail: list/grid left, plant detail/edit right; multi-select + bulk-assign; hover affordances |
| Plant Doctor `/doctor` | **Phone-primary** | Camera-first, minimal chrome, one-tap capture → result | Review/library: bigger galleries, side-by-side history, drag-drop upload |
| Garden Walk `/walk`, Quick `/quick`, Calendar `/quick/calendar` | **Phone-primary** | Keep focus-mode, big touch targets | Reachable but low-value; desktop equivalent is `/dashboard` |
| Light Sensor `/lightsensor`, Sun AR `/sun-trajectory` | **Phone-primary (sensor)** | Live readout, one-hand | "Use on your phone" explainer / historical only |
| Shopping `/shopping` | **Phone-primary** | Big tappable check rows, offline-tolerant | Bulk add / multi-list / drag between lists |
| Planner `/planner` | **Both, desktop-leaning** | Plan status list + "current phase / what's next" digest, "best set up on a bigger screen" hand-off | Wide planning bench: plan list + Phase 1/2/3 **stage board** (drag between phases) + reference photos side-by-side (reuse GardenLayoutEditor's palette+canvas+props pattern) |
| Routines `/schedule` | **Desktop-primary** | Status list of routines + next-fire | Real **schedule-builder grid**: all routines, inline frequency edit, 30-day dot-track, Optimise tab |
| Management `/management`, Home mgmt | **Desktop-primary** | Read/quick-tweak | Full config canvas |
| Integrations `/integrations` | **Desktop-primary (config); phone for live state** | Live soil reading + battery + one-tap valve on/off tile (not the rule builder) | Pairing wizard + rule builder |
| Head Gardener `/manager` (Evergreen) | **Desktop-primary** | "Top insight / 1 to look at" digest (+ tier-appropriate degrade) | Three-column report / Year-Plan / chat |
| Garden Layout `/garden-layout/:id` | **Desktop-primary (exemplar)** | View-only bottom-sheet (reconsider a thumb-friendly variant) | Left palette + canvas + right properties — **the template** for the other canvases |
| Journal hub `/journal` | **Both** | Tab switch + capture | Master-detail entries + notes |

---

## 5. Build order (each sub-phase ships + verifies independently)

**6a — Foundation + nav consolidation (no divergence yet; the shared fix all three architectures agree on).**
- Gate the sidebar: App.tsx:1498 `{!isFocusMode && (` → `{!isFocusMode && isMdBreakpoint && (}`. Bottom bar already self-hides on desktop → **desktop = rail-only, phone = bottom-bar-only.**
- Delete dead mobile machinery: `isMobileSidebarOpen` state (App.tsx:319), its matchMedia reset (~636) and NavItem reset (~1531); simplify `sidebarIsCollapsed` (1390) → `isNavCollapsed`. Grep for orphan reads first.
- Promote `MobileNavDrawer` **out of** the `isFocusMode` block to a **single** app-level mount driven by one shared `shelfOpen` state (shared with the focus-mode `QuickAccessMenuButton` to avoid a double-mount on `/quick` + `/walk`). Point the header hamburger at it on phone. This is the mandatory phone entry point for Journal / Integrations / Head Gardener / Quick, which the 5-slot Deck can't hold.
- Introduce the **canonical spine**: one destination array; `bottomTabs` = first slots, Shelf = the tail, rail = all — derived slices, with the Doctor "deck slot vs Tools group" divergence documented as an explicit projection rule.
- Consolidate the three hardcoded `768` checks (`useIsMobile.ts:14`, `App.tsx:321`, `GardenLayoutEditor.tsx:80`) into `src/constants/breakpoints.ts` + a `useIsDesktop()`/`useBreakpoint()` hook.
- Tests/docs in the same task: tighten `layout.spec` NAV-006 (assert `bottom-tab-bar` present + rail absent at 375px), add a "hamburger opens Shelf on a non-focus mobile route" E2E, update the persistent-ui nav docs + `21-routing`.

**6b — Phone posture (per-surface).** De-crowd the header (fold `+` into the Deck centre, HomeDropdown → icon + truncated label, `⌘K` stays desktop-only). Build the Deck: Home / Plants / **[centre]** / Planner / More. Per-surface phone digests (Integrations live tile, Routines/Planner/Head Gardener "what's next" status + warm "best on a bigger screen" hand-off). Simple density default on phone.

**6c — Desktop posture (adopt-on-touch, never big-bang).** Promote the one-off `xl:grid` idioms (PlantDoctor `[2fr_3fr]`, GardenProfile `[1fr_320px]`) into shared `<PageWithRail>` + `<MasterDetail>` `ui/` primitives. Wire the dead `lg:grid-cols-12` into `lg:col-span-8` + persistent `lg:col-span-4` rail, capped `max-w-[1600px] mx-auto`. Convert card-walls to inline master-detail on `lg+` (side pane at `Z.drawer=80`, below modals): Shed → Planner → Routines → Watchlist. Give the creative canvases their width using the GardenLayoutEditor pattern.

**6d — Hyperplexed polish (compositor-only, `motionTier`-gated, budgets honoured).** One shared green active marker sliding on `transform`/`ease-spring` (the `SegmentedTabs` technique) reused as **both** the rail active bar and the Deck accent — the "same nav moving" illusion. Capped stagger on Shelf + new desktop lists. `burst.ts` on reward moments only (task done, walk "All good", valve toggle, shopping tick) — never navigation. `PhotoGlow` behind plant heroes in desktop detail / Doctor result / Journal. One `SparkleAccent` max per screen as the AI signature. `can-hover:` reveals kebab/edit affordances on desktop; phones stay 44px always-visible. **Fix the one compositor-law violation:** rebuild the sidebar collapse as label opacity/`translate-x` (icons hold) instead of `transition-all` on width, which janks in WebView.

**6e — New-user calm + copy.** Single-slot onboarding (one priority card at a time; PWA/notification prompts become checklist steps); phone lands on the Today/Check digest at Simple density. Warm, specific copy ("3 beds need water before Saturday's heat"). Empty states coach with the surface's verb as hero. Trim the Shepherd tour; add exactly one step for the Deck centre action.

---

## 6. Hyperplexed polish, kept on-brand

Techniques adopted (all transform/opacity only, `motionTier`-gated, green-first, calm — never gimmicky): the sliding-marker nav illusion; spring press language (`active:scale-[0.97]` + `ease-spring`) on tabs/cards/nav items; reward-only particle bursts; `PhotoGlow` depth behind plant heroes; a single per-screen `SparkleAccent` as the AI mark; hover-revealed secondary actions on desktop; refined type hierarchy + generous whitespace so density reads as *calm* not *sparse*. **Anti-patterns avoided:** cursor-trail gimmicks, mesh-gradient walls, multi-blur stacks, motion on navigation, second bright colours competing with the green.

---

## 7. Risks & mitigations

- **Divergence cost** (forked layout tree for Both-class surfaces): mitigate with the shared `breakpoints.ts` + `useIsDesktop()` and the `PageWithRail`/`MasterDetail` primitives, so only the tree that *must* differ forks while data/hooks stay shared.
- **Test churn:** NAV-006 loses the sidebar "Dashboard" button at 375px → retarget to the bottom bar; add Shelf E2E. Most NAV specs run at ~1280px where the rail survives.
- **Double-mount** of `MobileNavDrawer`: single app-level mount + shared state.
- **Centre-FAB stacking/safe-area:** stays inside the bar's `Z.nav` context, respects `env(safe-area-inset-bottom)`.
- **Scope:** 6a is safe and self-contained; each later sub-phase is independently shippable and reviewable. Adopt-on-touch prevents a big-bang desktop rewrite.

---

## 8. App-reference / test docs that will need updating

Per sub-phase: `09-persistent-ui/02-sidebar.md`, `11-bottom-tab-bar.md`, `01-header.md`; `99-cross-cutting/21-routing.md`, `40-design-system.md`; the per-surface refs for each surface that diverges; `docs/e2e-test-plan/17-layout-nav.md` + new rows; `TESTING.md` counts. Any new `ui/` primitive (`PageWithRail`, `MasterDetail`) gets a Vitest test and a design-system doc entry.

---

## 9. Decisions — CONFIRMED (2026-07-20)

1. **Phone Deck centre slot → Capture FAB (hybrid).** A raised green Capture action as the default centre (routes via `quickLauncherCatalogue` to Doctor / add journal entry / Walk — a router, never a second Doctor), swapping to a surface-specific action only where one dominates. `GlobalQuickAdd`'s `+` folds into this on phone.
2. **Nav labels → keep nouns.** Home / Plants / Planner / Tools stay; lean verb-ish only in copy and empty-states. No relabel relearning cost.
3. **Head Gardener on phone → in the Shelf, degrades.** Present in the overflow Shelf for everyone; below Evergreen it renders a tips digest + upsell rather than the full tool.
4. **⌘K command palette → deferred.** Out of Phase 6 scope; revisit after 6a–6e land. Keeps scope bounded and avoids the tier-gating leak risk.
