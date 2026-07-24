# Routing — React Router v6, Deep Links, URL State

> Rhozly uses React Router v6 with BrowserRouter. URL is the source of truth for navigation (tabs, modals, filters via `?open=...`, `?tab=...`, etc.). Capacitor native handles deep links via the App URL listener.

---

## Quick Summary

```
BrowserRouter
└── App.tsx routes
    ├── /                  ← Redirect → /dashboard (BOTH phone + desktop; the phone-only /quick landing was retired 2026-07-20 — "one responsive home")
    ├── /quick             ← Redirect → /dashboard replace (legacy deep-links only; QuickAccessHome was RETIRED 2026-07-20; the quickLauncher catalogue/prefs/hook/picker were deleted outright 2026-07-23 — QuickActionsRow now renders only a "Start a Garden Walk" tile, shown once the home has ≥5 plants)
    ├── /quick/calendar    ← LocalizedTaskCalendar (planting + rain advice + today's tasks; ORPHANED/URL-only since its dashboard "Today" launcher tile was removed 2026-07-21 — no in-app nav path reaches it anymore; still focus-mode on mobile)
    │   (retired: /library/* — the entire Library UI was removed in Wave 17.
    │    Plant search is now in-context (Add-to-Shed / Shopping / Multi-ID /
    │    Nursery picker); the detail overlay is PlantDetailModal, opened from
    │    any search-result row + Seasonal Picks tiles.)
    ├── /walk              ← GardenWalk (guided card-per-plant inspection)
    │
    │   (Wave 6: the /quick/* routes render in focus mode on mobile —
    │    persistent top bar + side nav hidden; QuickAccessMenuButton +
    │    MobileNavDrawer provide nav access on demand. RHO-18: /walk is
    │    focus-mode at EVERY viewport width (not just mobile) — it's a
    │    full-screen guided surface; the floating profile dropdown is
    │    suppressed on /walk so it doesn't clash with the card's Stop button.
    │    isFocusMode = isWalk || (isMobile && /quick) — UNCHANGED, but since
    │    the /quick HOME now redirects to /dashboard (retired 2026-07-20),
    │    /quick/calendar is the only /quick route that still paints in focus
    │    mode. Focus-mode surfaces are therefore: /walk (all viewports) +
    │    /quick/calendar (mobile planting helper).
    │    Phase 6a: the MobileNavDrawer (the "Shelf") is no longer focus-only.
    │    It's now a SINGLE app-level mount rendered whenever
    │    (isFocusMode || !isMdBreakpoint), so it serves every phone route as
    │    the overflow nav — opened by the header hamburger on normal routes,
    │    by QuickAccessMenuButton in focus mode. The left sidebar rail is
    │    gated behind isMdBreakpoint and never renders on phones now.)
    ├── /dashboard         ← Dashboard container (Dashboard [home] / Calendar / Weather sub-tabs via ?view=; Locations tab retired Stage 4a)
    ├── /shed              ← GardenHub (Plants | Ailments — Hub v3 Stage D; ?tab=nursery → Seed box sheet, ?tab=senescence[&plant=] → Inactive chip, both auto-redirect; legacy flag restores 4 tabs)
│                        Stage E: ?detail=<ailment_library.id> on tab=watchlist opens the shared field-guide detail (shareable; open PUSHes, close REPLACE-deletes; unknown id fail-softs)
│                        #7: ?owned=<ailments.id> on tab=watchlist opens the OWNED-ailment detail modal — same reactive pattern (open PUSHes, close REPLACE-deletes; derived from the loaded `ailments`), so swipe-back / Escape closes JUST the modal instead of popping the Plants→Ailments tab switch
│                        #7b: ?lib=<ailment_library.id> inside the ailment SEARCH takeover opens the library-row detail with the same open-PUSH/close-REPLACE pattern (object stashed in a ref, param is source-of-truth), so Back closes just the detail, not the whole takeover
├── /ailment-library   ← REDIRECT (Stage F): → /shed?tab=watchlist; ?ailment=X → &detail=X (AilmentLibraryRedirect in App.tsx — page deleted, URLs never die)
    ├── /schedule          ← BlueprintManager
    ├── /planner           ← PlannerHub (?tab=planner|shopping)
    ├── /doctor            ← PlantDoctor
    ├── /profile           ← GardenProfile + HabitQuiz
    ├── /management        ← LocationManager
    ├── /watchlist         ← redirect → /shed?tab=watchlist
    ├── /visualiser        ← PlantVisualiser
    ├── /lightsensor       ← Sun Tracker family
    ├── /sun-trajectory    ← SunTrajectoryAR
    ├── /guides            ← GuideList (?tab=rhozly|community|help)
    ├── /help              ← Redirect → /guides?tab=help (Sprint 2 — top-level shortcut to App Help)
    ├── /join/:token       ← JoinHomeViaToken (Sprint 4b — invite redemption landing page; lives OUTSIDE AppShell so signed-out invitees can land on it before signing in)
    ├── /shopping          ← ShoppingLists (alias to /planner?tab=shopping)
    ├── /gardener          ← GardenerProfile (Account Settings; ?tab=account|notifications|achievements|stats, ?section=plans)
    ├── /journal           ← JournalNotesHub (Journal + Notes tabs; ?tab=notes deep-links Notes — Phase 5 IA merge)
    ├── /weekly            ← WeeklyOverviewPage
    ├── /reports           ← GardenReports (month/year in review — surfaced Stage 5, B16)
    ├── /notes             ← redirect → /journal?tab=notes (Phase 5 IA — Notes folded into the Journal hub as a tab)
    ├── /credits           ← CreditsPage (image attribution)
    ├── /share/garden-layout/:token ← shared read-only garden layout (outside AppShell)
    ├── /home-management   ← HomeManagement
    ├── /audit             ← AuditPage
    ├── /integrations      ← IntegrationsPage
    ├── /garden-layout     ← GardenLayoutList
    ├── /garden-layout/:layoutId  ← GardenLayoutEditor
    ├── /admin/guides      ← AdminGuideGenerator
    └── /tools             ← ToolsHub
```

---

## Role 1 — Technical Reference

### URL state patterns

| Pattern | Purpose |
|---------|---------|
| `?view=X` | Sub-tab within Dashboard (home \| locations \| calendar \| weather — see the table below) |
| `?tab=X` | Sub-tab elsewhere (Garden Hub shed/watchlist/senescence, Planner, Guides, Account, Routines blueprints/optimise) |
| `?open=X` | Auto-open a modal on the destination |
| `?q=X` | Search query (Guides) |
| `?locationId=X` / `?areaId=X` / `?instanceId=X` | Drill-in (Dashboard locations → area → plant) |
| `?date=YYYY-MM-DD` | Select a day on the Calendar (TaskCalendar) |
| `?category=X` | Filter Routines by task type (BlueprintManager) |
| `?section=plans` | Force the Account tab + scroll to the "Your Plan" picker (`#plan-section`); tier-locked `UpgradeNudge` banners route here (RHO-12) |
| `?ailment=X` | Deep-link an Ailment Library entry |

### `/dashboard` `?view=` param (three tabs — Overview merged in Phase 4.2, Locations retired Stage 4a)

Parsed in `src/App.tsx` (~line 514; `DashboardView = "home" | "calendar" | "weather"`). Three sub-tabs: Dashboard (home) / Calendar / Weather.

| `?view=` value | Resolves to | Label | Content |
|---------------|-------------|-------|---------|
| *(absent)* | `home` | **Dashboard** | The merged Home dashboard (default) — [Home (Main Dashboard)](../02-dashboard/17-home-main.md) |
| `home` | `home` | Dashboard | Same |
| `calendar` | `calendar` | Calendar | unchanged |
| `weather` | `weather` | Weather | unchanged |
| `locations` *(legacy)* | `home` | — | The Locations tab was **retired** into the home garden grid (stats+locations redesign Stage 4a, 2026-07-20) — dropped from the `DashboardView` union + parser allowlist; old links fall through to home. See [Locations Tab — RETIRED](../02-dashboard/02-locations-tab.md) |
| `dashboard` *(legacy)* | `home` | — | Backwards compat: old deep links / notifications land on the merged home |
| `overview` *(legacy)* | `home` | — | The Overview tab was **merged into Home** (Phase 4.2) — its cards live behind Home's Detailed density; old links fall through to home. See [Dashboard Tab (Overview) — ARCHIVED](../02-dashboard/01-dashboard-tab.md) |
| *anything else* | `home` | — | Unknown values fall back to the default |

**localStorage persistence (`rhozly_dashboard_view`):**

- Visiting `/dashboard` with an explicit `?view=` writes the **resolved** view (legacy `dashboard` / `overview` persist as `home`).
- Visiting plain `/dashboard` restores the saved view **once per mount** only (subsequent sub-tab clicks to "Dashboard" stick, and record `home` for next session).
- Only `calendar | weather` are restored. Stored legacy `"dashboard"`, `"overview"` **and** `"locations"` values are **deliberately not restored** — they fall through to the `home` default once; the user's next explicit choice is respected from then on. (Stage 4a dropped `"locations"` from the restore allowlist.)
- The switcher's "Dashboard" button navigates to plain `/dashboard` (no param); the other two navigate to `/dashboard?view=<v>` (all `replace: true`).

### Quick-add deep links (from GlobalQuickAdd)

Pruned to the 5 highest-frequency "create" verbs (Phase 5 IA pass) — cut items (To-Do lists, Add Task Automation, Log Ailment, Create Guide) remain reachable from their own surfaces.

| Action | Path |
|--------|------|
| Add Plant | `/shed?open=add-plant` |
| Add Task | `/dashboard?view=calendar&open=add-task` |
| Diagnose a Plant | `/doctor` |
| Create Plan | `/planner?open=new-plan` |
| Add Location | `/management?open=add-location` |

### URL state consumption

Each destination reads relevant params via `useSearchParams()`:

```ts
const [params, setParams] = useSearchParams();
useEffect(() => {
  if (params.get("open") === "add-task") {
    setIsBuilding(true);
    setParams(prev => { const n = new URLSearchParams(prev); n.delete("open"); return n; }, { replace: true });
  }
}, []);
```

Pattern: read once, then strip the `?open=` param to avoid re-opening on subsequent navigations.

### Nav active-state — orphan-route reparenting (Phase 5 IA; mobile rewritten for the Phase 6b Deck)

Several routes have no nav item of their own, so they're folded into a parent item's `matchPaths` (in `navLinks`, `src/App.tsx` ~line 1379) so the active-nav highlight still resolves when you land on them. A route matches when `pathname === p || pathname.startsWith(p + "/")`.

**Desktop sidebar + the mobile Shelf** share the exact same `navLinks` array (the Shelf — `MobileNavDrawer` — is passed `navLinks` filtered to drop `dashboard`/`shed` in normal mode, full `navLinks` in focus mode), so orphan-route highlighting resolves identically on both:

| Orphan route | Highlights |
|---|---|
| `/schedule` (Routines) | Planner |
| `/weekly` (Weekly Overview) | Tools |
| `/reports` (Garden Reports) | Tools |
| `/management`, `/home-management` (Location Manager / home management) | Dashboard |
| `/journal`, `/notes` | Journal |

**The mobile bottom tab bar (the Deck) is a separate, narrower list and does NOT use `navLinks`.** Since Phase 6b it has only two route-backed destination tabs — **Home** (`matchPaths: /dashboard, /management, /home-management`) and **Plants** (`matchPaths: /shed, /watchlist`) — plus three action slots with no `matchPaths` at all: **Capture** (opens the Capture sheet), **Tasks** (opens the Today's-Tasks tray), and **More** (opens the Shelf). Planner, Tools, Journal, Integrations, and Head Gardener have **no Deck slot** and light no bottom tab; they're reached via **More → the Shelf**, whose own active-highlighting falls back to the desktop table above. See [Bottom Tab Bar](../09-persistent-ui/11-bottom-tab-bar.md) for the full slot-by-slot breakdown.

The **Head Gardener** nav item (`/manager`) is conditionally rendered — it only appears when `tierAllowsFeature(profile.subscription_tier, "head_gardener")` is true (Evergreen tier; see `src/constants/tierFeatures.ts`). Lower tiers don't see the nav entry, but the `/manager` route still exists and renders its own `FeatureGate` upgrade wall for anyone who deep-links in. See [Sidebar Navigation](../09-persistent-ui/02-sidebar.md) and [Bottom Tab Bar](../09-persistent-ui/11-bottom-tab-bar.md) for the full per-item `matchPaths`.

### Redirect routes

Legacy / alias paths that immediately `Navigate ... replace` to their canonical home:

| From | To |
|---|---|
| `/` (index) | `/dashboard` (BOTH phone + desktop since 2026-07-20 — previously phone redirected to `/quick`) |
| `/quick` | `/dashboard` (`replace`; the phone-only Quick Access Home was retired — the launcher now lives on the dashboard) |
| `/notes` | `/journal?tab=notes` (Phase 5 IA — Notes folded into the Journal hub) |
| `/insights` | `/manager?tab=insights` |
| `/watchlist` | `/shed?tab=watchlist` |
| `/ailment-library` | `/shed?tab=watchlist` (`?ailment=X` carries over to `&detail=X`; `AilmentLibraryRedirect` in App.tsx — page deleted, URLs never die) |
| `/shopping` | `/planner?tab=shopping` |
| `/help` | `/guides?tab=help` |
| `*` (unknown) | `/dashboard` |

### Deep links (native via Capacitor)

`src/main.tsx` (or `src/App.tsx`) wires `App.addListener("appUrlOpen", ...)` to navigate when the OS hands Rhozly a `rhozly://` URL.

### History / back stack

React Router manages history. Some modals close via back button via `useNavigate(-1)`.

### Migration history

See `docs/routing-migration-plan.md` for the move from state-based tabs to React Router. See `docs/deep-linking-plan.md` for native deep links.

---

## Role 2 — Expert Gardener's Guide

### Why URL state matters

You can bookmark, share, and back-button anywhere. "Open me on the Watchlist with the Ailment modal open" is a single URL.

### Implications

- Browser back/forward works naturally.
- Refreshing the page lands you on the same screen + tab.
- Sharing a URL with a partner reproduces your view exactly.

---

## Related reference files

- [Home (Main Dashboard)](../02-dashboard/17-home-main.md) — the `?view=home` default + legacy mapping consumer
- [Dashboard Tab (Overview) — ARCHIVED](../02-dashboard/01-dashboard-tab.md) — the merged-away `?view=overview` tab (historical)
- [Global Quick Add](../08-modals-and-overlays/23-global-quick-add.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)
- [Capacitor](./23-capacitor.md)

## Code references for ongoing maintenance

- `src/App.tsx` — route definitions
- `src/main.tsx` — Capacitor deep link wiring
- `docs/routing-migration-plan.md`
- `docs/deep-linking-plan.md`
