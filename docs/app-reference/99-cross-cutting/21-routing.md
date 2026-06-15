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
    │   (Wave 6: on mobile, the /quick/* AND /walk routes render in focus
    │    mode — persistent top bar + side nav hidden; QuickAccessMenuButton +
    │    MobileNavDrawer provide nav access on demand. Desktop unchanged.)
    ├── /dashboard         ← Home (Dashboard / Locations / Calendar / Weather sub-tabs via ?view=)
    ├── /shed              ← TheShed
    ├── /schedule          ← BlueprintManager
    ├── /planner           ← PlannerHub (?tab=planner|shopping)
    ├── /doctor            ← PlantDoctor
    ├── /profile           ← GardenProfile + HabitQuiz
    ├── /management        ← LocationManager
    ├── /watchlist         ← AilmentWatchlist
    ├── /visualiser        ← PlantVisualiser
    ├── /lightsensor       ← Sun Tracker family
    ├── /sun-trajectory    ← SunTrajectoryAR
    ├── /guides            ← GuideList (?tab=rhozly|community|help)
    ├── /help              ← Redirect → /guides?tab=help (Sprint 2 — top-level shortcut to App Help)
    ├── /join/:token       ← JoinHomeViaToken (Sprint 4b — invite redemption landing page; lives OUTSIDE AppShell so signed-out invitees can land on it before signing in)
    ├── /shopping          ← ShoppingLists (alias to /planner?tab=shopping)
    ├── /gardener          ← GardenerProfile (Account Settings)
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
| `?view=X` | Sub-tab within Dashboard |
| `?tab=X` | Sub-tab elsewhere (Planner, Guides, Account Settings) |
| `?open=X` | Auto-open a modal on the destination |
| `?q=X` | Search query (Guides) |
| `?locationId=X` | Drill-in (Location Page) |

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

- [Global Quick Add](../08-modals-and-overlays/23-global-quick-add.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)
- [Capacitor](./23-capacitor.md)

## Code references for ongoing maintenance

- `src/App.tsx` — route definitions
- `src/main.tsx` — Capacitor deep link wiring
- `docs/routing-migration-plan.md`
- `docs/deep-linking-plan.md`
