# Wave 2 — Quick Access shell + Visual Lens mobile route

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md) · prev: [Wave 1](./mobile-quick-access-wave-1.md) (shipped)

## Goal

Ship the **mobile home screen** that surfaces Wave 1's Visual Lens, leaves placeholder tiles for the calendar and journal (Waves 3-4), and routes phone users to it on app open.

After this wave, a phone user opening Rhozly lands on a clean three-tile screen tuned for one-thumb use:

```
┌──────────────────────────┐
│   What can I help with?  │
│                          │
│  ┌────────────────────┐  │
│  │ 📷  Visual Lens     │  │
│  │  Analyse a plant    │  │  ← live, opens /quick/lens
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ 📅  Today           │  │
│  │  Soon              │  │  ← placeholder (Wave 3)
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ 📝  Quick Capture   │  │
│  │  Soon              │  │  ← placeholder (Wave 4)
│  └────────────────────┘  │
│                          │
│  [Open full dashboard →] │
└──────────────────────────┘
```

The side nav stays available so users can drop into any full-app screen at any time. Desktop is unaffected — it keeps landing on `/dashboard`.

## App-reference files consulted

- [02-dashboard/01-home-dashboard.md](../app-reference/02-dashboard/01-home-dashboard.md) — current home (desktop default stays the same).
- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — Wave 1's `/doctor` Analyse button (the mobile lens route shares the same component).
- [99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md) — current routing patterns + `BrowserRouter` setup.
- [99-cross-cutting/23-capacitor.md](../app-reference/99-cross-cutting/23-capacitor.md) — `Capacitor.isNativePlatform()` usage. Existing example: `usePushNotifications`.
- [09-persistent-ui](../app-reference/09-persistent-ui/) — nav layout reference (side nav, collapsible on narrow viewports).

Source files studied:
- [src/App.tsx](../../src/App.tsx) — route table (~line 989-1413), nav rendering (~line 910-958), navLinks array (TBD location).
- [src/hooks/usePushNotifications.ts](../../src/hooks/usePushNotifications.ts) — pattern for `Capacitor.isNativePlatform()` early-return.
- [src/components/PlantDoctor.tsx](../../src/components/PlantDoctor.tsx) — the Analyse flow shipped in Wave 1.
- [src/components/NavItem.tsx](../../src/components/NavItem.tsx) — nav row component (supports `isMobile` / `isCollapsed` props).

## Architecture corrections from the master plan

Master plan assumed a **bottom nav**. The current app uses a **side nav** that collapses to icon-only at `< md` (768px). Wave 2 keeps that — no new nav component. We add one entry to the existing `navLinks` array and hide it on desktop.

## Decisions

### Decision 1 — Reuse `PlantDoctor.tsx` behind `/quick/lens`, don't fork

Tempting: build a slim `VisualLens.tsx` that just does Analyse — no tabs, no picker, no other buttons. Cleaner mobile UI in theory.

**Rejected.** Would duplicate the photo capture flow, image compression, session-saving logic, Capacitor camera handling, image-handoff-from-sessionStorage flow, plant-instance picker, etc. The Wave 1 Analyse button + `AnalyseResultCard` already produce a focused single-page experience when only Analyse is used. Mobile users who *want* to drop into Identify/Diagnose/Pest can still tap the secondary row.

Instead: `/quick/lens` mounts `PlantDoctor.tsx` with a new `compact` prop that:
- Hides the Analyse / History tab bar (no history view on the mobile shortcut — it's available at `/doctor`).
- Hides the secondary action row (Identify / Diagnose / Pest stay reachable via `/doctor`).
- Keeps everything else: photo capture, instance picker, Analyse button, result card.

Net result: mobile lens screen shows photo capture → big Analyse button → result. Six lines of conditional rendering, zero duplicated logic.

### Decision 2 — `useIsMobile()` is the single source of truth

Right now `App.tsx` uses `isMdBreakpoint` inline (from a `useBreakpoints` hook or similar — confirm during implementation). For routing-level decisions ("which home page?") we want a hook with stable semantics across native + web.

New hook:

```ts
// src/hooks/useIsMobile.ts
import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

const MOBILE_MAX_WIDTH = 768;

function subscribe(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_MAX_WIDTH;
}

export function useIsMobile(): boolean {
  const isNative = Capacitor.isNativePlatform();
  const isNarrow = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return isNative || isNarrow;
}
```

`useSyncExternalStore` avoids the SSR-warning + initial-flash issues a `useState + useEffect` pattern has. Same breakpoint threshold the rest of the app uses (Tailwind `md` = 768px), so visual + routing decisions stay aligned.

### Decision 3 — Tiles are tappable cards, not navigation items

A 3-tile grid is the visual hero. Each tile is a big tap target (≥120px tall) with an icon, title, one-line description. Inactive ones show "Coming soon" with a subdued treatment instead of being absent — sets expectations for what's coming and avoids the empty-screen feel.

### Decision 4 — `/` redirect is conditional on `useIsMobile`

Current: `<Route path="/" element={<Navigate to="/dashboard" replace />} />`

New:
```tsx
<Route path="/" element={<Navigate to={isMobile ? "/quick" : "/dashboard"} replace />} />
```

The whole shell uses `useIsMobile()` once at the top of `App.tsx` for this decision + the nav-link visibility (Decision 5). Cheap.

### Decision 5 — "Quick" nav link is mobile-only

Add an entry to `navLinks` keyed off `useIsMobile()`. On desktop the entry is filtered out. This means desktop users who hit `/quick` directly via URL still get the page (a bit empty since the placeholders dominate), but it's not surfaced in their nav.

### Decision 6 — Visual Lens tile is the only live one

Calendar + Journal tiles render as "Coming soon" with a disabled style. Tapping them shows a small toast: *"Coming in the next update — for now, find this in [Dashboard / Plant Doctor]"*. No dead routes, no half-built features.

### Decision 7 — "Open full dashboard →" link at the bottom

Power-user escape hatch directly to `/dashboard` from the Quick screen. Some users will skip the side nav and want a single tap. One link, no further treatment needed.

## File touch list

| File | Status | Change |
|---|---|---|
| `src/hooks/useIsMobile.ts` | **NEW** | The hook. |
| `src/components/QuickAccessHome.tsx` | **NEW** | The three-tile mobile home. |
| `src/components/quick/QuickTile.tsx` | **NEW** | One reusable tile (icon, title, description, active/disabled state). |
| `src/components/QuickAccessLens.tsx` | **NEW** | Thin wrapper that mounts `<PlantDoctor compact />`. Lives at `/quick/lens`. |
| `src/components/PlantDoctor.tsx` | edit | Accept optional `compact?: boolean` prop. When true, hide tabs + secondary action row. |
| `src/App.tsx` | edit | (a) Call `useIsMobile()` at the top of the routed shell. (b) Make `/` redirect conditional. (c) Add `/quick` and `/quick/lens` routes. (d) Add "Quick" entry to `navLinks` filtered by `useIsMobile`. |

## App-reference work

| File | Action |
|---|---|
| `docs/app-reference/02-dashboard/04-quick-access-home.md` | **CREATE** using `_template.md`. New surface. |
| `docs/app-reference/05-tools/02-plant-doctor.md` | UPDATE — add the `compact` prop, document `QuickAccessLens` wrapper, link Quick Access Home as a related file. |
| `docs/app-reference/99-cross-cutting/21-routing.md` | UPDATE — add `/quick`, `/quick/lens` and the conditional `/` redirect. |
| `docs/app-reference/99-cross-cutting/23-capacitor.md` | UPDATE — add `useIsMobile` as a documented usage of `isNativePlatform()`. |
| `docs/app-reference/00-INDEX.md` | UPDATE — `[ ] Quick Access Home` tickable row in `02-dashboard`. |

## Tests

| Tier | Test |
|---|---|
| Vitest | `useIsMobile` — native always returns true; web returns true below 768px, false above (mock `window.innerWidth` + `Capacitor.isNativePlatform()`) |
| Vitest | `QuickTile` rendering — active tile is tappable + has correct test-id; disabled tile is non-clickable + shows "Coming soon" badge |
| Vitest | `QuickAccessHome` — renders three tiles; clicking Visual Lens calls navigate to `/quick/lens` |
| Playwright | (NEW) `tests/e2e/specs/quick-access.spec.ts` — set viewport to 375x812, visit `/`, expect to land on `/quick`, click Visual Lens tile, expect `/quick/lens` with the Analyse hero button visible. Desktop viewport (1280x800) → expect `/` to redirect to `/dashboard`. |
| Playwright | E2E test for desktop should also confirm the "Quick" nav entry is **not** present on `< md` viewport (i.e. the link is hidden). |

## Data-safety audit

| Change | Risk |
|---|---|
| `useIsMobile()` hook | None — pure read of `Capacitor.isNativePlatform()` + viewport |
| New routes | None — additive, no destructive change |
| `/` redirect change | Existing bookmarks to `/dashboard` keep working; only the root-redirect target changes. Mobile users currently on `/dashboard` are unaffected — they only see the new behaviour on next app-open from the root |
| `compact` prop on PlantDoctor | None — defaults to false; every existing call site keeps identical behaviour |
| Nav link addition | None — conditional render, doesn't affect existing links |
| No DB changes | — |

## Implementation order

1. **`useIsMobile()` hook** + Vitest. Confirm against the existing `isMdBreakpoint` logic in `App.tsx` so they agree on the threshold.
2. **`QuickTile.tsx`** + Vitest for the active vs disabled states.
3. **`QuickAccessHome.tsx`** + Vitest for the three-tile render + navigation.
4. **`PlantDoctor.tsx` `compact` prop** — six conditional `&& !compact &&` wraps around the tab bar + secondary action row. Run existing PlantDoctor tests; nothing should regress.
5. **`QuickAccessLens.tsx`** — three-line wrapper that renders `<PlantDoctor compact homeId={…} {...props} />`.
6. **`App.tsx` wiring** — `useIsMobile()` call, conditional redirect, two new `<Route>` entries, `navLinks` mobile-only entry.
7. **Playwright spec** for the routing + nav-visibility behaviour.
8. **App-reference docs** — create the new home file, update the four others.
9. **Manual test**:
   - Desktop browser → `/` → lands on `/dashboard`. No "Quick" in nav.
   - Resize to < 768px → next `/` visit lands on `/quick`. "Quick" appears in nav.
   - Tap Visual Lens tile → `/quick/lens` → take a photo → Analyse → tasks commit.
   - Tap "Open full dashboard →" → lands on `/dashboard` with full nav available.
   - Native Capacitor build (best-effort) → confirm `useIsMobile()` returns true regardless of viewport.
10. **Commit + deploy** with `[skip ci]` and `npm run deploy`.

## What this wave doesn't do

- **No mobile-only re-skin** of any existing screen. Quick Access is *additive*; the dashboard / shed / planner remain identical on mobile.
- **No Calendar / Journal logic** (Waves 3 + 4).
- **No frost-date table** (Wave 3).
- **No `plant_journals` migration** (Wave 4).
- **No bottom nav.** The side nav stays.
- **No new tier or beta gate.**

## Locked decisions

| Question | Decision |
|---|---|
| "Coming soon" tile tap behaviour | **Toast with closest equivalent.** Calendar tile tap → `"Coming soon — view today's tasks on the Dashboard"`. Journal tile tap → `"Coming soon — open a plant's Journal tab"`. Confirms the tap + points to existing path. |
| Desktop visit to `/quick` | **Allow with a small "mobile shortcut" banner.** Page renders normally; banner sits at the top: *"This is the mobile shortcut screen — your full dashboard is at /dashboard"* with a link. Admins can preview the screen; not a dead-end. |
