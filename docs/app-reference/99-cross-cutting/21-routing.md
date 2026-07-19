# Routing — React Router v6, Deep Links, URL State

> Rhozly uses React Router v6 with BrowserRouter. URL is the source of truth for navigation (tabs, modals, filters via `?open=...`, `?tab=...`, etc.). Capacitor native handles deep links via the App URL listener.

---

## Quick Summary

```
BrowserRouter
└── App.tsx routes
    ├── /                  ← Conditional redirect: useIsMobile() === true → /quick, else → /dashboard
    ├── /quick             ← QuickAccessHome (Mobile Quick Access Wave 2 — mobile home page)
    │     └── (retired: /quick/lens, /quick/journal — see Wave 17 notes)
    ├── /quick/calendar    ← LocalizedTaskCalendar (Mobile Quick Access Wave 3 — planting + rain advice + today's tasks)
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
    │    isFocusMode = isWalk || (isMobile && /quick).)
    ├── /dashboard         ← Dashboard container (Dashboard [home] / Locations / Calendar / Weather sub-tabs via ?view=)
    ├── /shed              ← GardenHub (Shed / Watchlist / Senescence sub-tabs via ?tab=)
    ├── /schedule          ← BlueprintManager
    ├── /planner           ← PlannerHub (?tab=planner|shopping)
    ├── /doctor            ← PlantDoctor
    ├── /profile           ← GardenProfile + HabitQuiz
    ├── /management        ← LocationManager
    ├── /watchlist         ← redirect → /shed?tab=watchlist
    ├── /ailment-library   ← AilmentLibrary (?ailment= to deep-link an entry)
    ├── /visualiser        ← PlantVisualiser
    ├── /lightsensor       ← Sun Tracker family
    ├── /sun-trajectory    ← SunTrajectoryAR
    ├── /guides            ← GuideList (?tab=rhozly|community|help)
    ├── /help              ← Redirect → /guides?tab=help (Sprint 2 — top-level shortcut to App Help)
    ├── /join/:token       ← JoinHomeViaToken (Sprint 4b — invite redemption landing page; lives OUTSIDE AppShell so signed-out invitees can land on it before signing in)
    ├── /shopping          ← ShoppingLists (alias to /planner?tab=shopping)
    ├── /gardener          ← GardenerProfile (Account Settings; ?tab=account|notifications|achievements|stats, ?section=quick-launcher|plans)
    ├── /journal           ← JournalNotesHub (Journal + Notes tabs; ?tab=notes deep-links Notes — Phase 5 IA merge)
    ├── /weekly            ← WeeklyOverviewPage
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
| `?section=quick-launcher` | Scroll to the Quick Launcher picker on Account settings |
| `?section=plans` | Force the Account tab + scroll to the "Your Plan" picker (`#plan-section`); tier-locked `UpgradeNudge` banners route here (RHO-12) |
| `?ailment=X` | Deep-link an Ailment Library entry |

### `/dashboard` `?view=` param (four tabs — Overview merged into Home, Phase 4.2)

Parsed in `src/App.tsx` (~line 511). Four sub-tabs: Dashboard (home) / Locations / Calendar / Weather.

| `?view=` value | Resolves to | Label | Content |
|---------------|-------------|-------|---------|
| *(absent)* | `home` | **Dashboard** | The merged Home dashboard (default) — [Home (Main Dashboard)](../02-dashboard/17-home-main.md) |
| `home` | `home` | Dashboard | Same |
| `locations` | `locations` | Locations | unchanged |
| `calendar` | `calendar` | Calendar | unchanged |
| `weather` | `weather` | Weather | unchanged |
| `dashboard` *(legacy)* | `home` | — | Backwards compat: old deep links / notifications land on the merged home |
| `overview` *(legacy)* | `home` | — | The Overview tab was **merged into Home** (Phase 4.2) — its cards live behind Home's Detailed density; old links fall through to home. See [Dashboard Tab (Overview) — ARCHIVED](../02-dashboard/01-dashboard-tab.md) |
| *anything else* | `home` | — | Unknown values fall back to the default |

**localStorage persistence (`rhozly_dashboard_view`):**

- Visiting `/dashboard` with an explicit `?view=` writes the **resolved** view (legacy `dashboard` / `overview` persist as `home`).
- Visiting plain `/dashboard` restores the saved view **once per mount** only (subsequent sub-tab clicks to "Dashboard" stick, and record `home` for next session).
- Only `locations | calendar | weather` are restored. Stored legacy `"dashboard"` **and** `"overview"` values are **deliberately not restored** — they fall through to the `home` default once; the user's next explicit choice is respected from then on.
- The switcher's "Dashboard" button navigates to plain `/dashboard` (no param); the other three navigate to `/dashboard?view=<v>` (all `replace: true`).

### Quick-add deep links (from GlobalQuickAdd)

| Action | Path |
|--------|------|
| Add Task | `/dashboard?view=calendar&open=add-task` |
| Add Task Automation | `/schedule?open=add-task` |
| Add Plant | `/shed?open=add-plant` |
| Create Plan | `/planner?open=new-plan` |
| Create Location | `/management?open=add-location` |
| Log Ailment | `/shed?tab=watchlist&open=add-ailment` |
| Create Guide | `/guides?tab=community&open=new-guide` |

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

### Nav active-state — orphan-route reparenting (Phase 5 IA)

Several routes have no nav item of their own, so they're folded into a parent item's `matchPaths` (in `navLinks` / `bottomTabs`, `src/App.tsx`) so the active-nav highlight still resolves when you land on them. A route matches when `pathname === p || pathname.startsWith(p + "/")`.

| Orphan route | Highlights (desktop sidebar) | Highlights (mobile bottom tab) |
|---|---|---|
| `/schedule` (Routines) | Planner | Planner |
| `/weekly` (Weekly Overview) | Tools | Tools |
| `/management`, `/home-management` (Location Manager / home management) | Dashboard | Home |
| `/journal`, `/notes` | Journal (desktop has its own Journal item) | Planner (no Journal tab on mobile) |

The **Head Gardener** nav item (`/manager`) is conditionally rendered — it only appears when `tierAllowsFeature(profile.subscription_tier, "head_gardener")` is true (Evergreen tier; see `src/constants/tierFeatures.ts`). Lower tiers don't see the nav entry, but the `/manager` route still exists and renders its own `FeatureGate` upgrade wall for anyone who deep-links in. See [Sidebar Navigation](../09-persistent-ui/02-sidebar.md) and [Bottom Tab Bar](../09-persistent-ui/11-bottom-tab-bar.md) for the full per-item `matchPaths`.

### Redirect routes

Legacy / alias paths that immediately `Navigate ... replace` to their canonical home:

| From | To |
|---|---|
| `/notes` | `/journal?tab=notes` (Phase 5 IA — Notes folded into the Journal hub) |
| `/insights` | `/manager?tab=insights` |
| `/watchlist` | `/shed?tab=watchlist` |
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
