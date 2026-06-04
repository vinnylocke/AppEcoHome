# Plan — Discoverability for `/weekly` (Wave 21 follow-up)

## Goal

Wave 21 shipped the Weekly Overview page at `/weekly` and the matching push notification, but the page has **no in-app entry point** — desktop users who don't tap the Sunday push and don't know the URL can't reach it. Add two small discoverability surfaces so the page is reachable from the dashboard and from the mobile Quick Launcher.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) — confirms route, props (`homeId`), data flow, and that "no nav entry" is the current state
- [`docs/app-reference/02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) — confirms the Quick Launcher is a data-driven catalogue: appending one entry to `QUICK_LAUNCHER_CATALOGUE` makes it pinnable in the picker, no other code changes required
- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — the natural home for a desktop link (the existing "This Week at a Glance" header at [HomeDashboard.tsx:529](../../src/components/HomeDashboard.tsx#L529) is the perfect anchor)
- [`docs/app-reference/99-cross-cutting/21-routing.md`](../app-reference/99-cross-cutting/21-routing.md) — `/weekly` already wired via `<Route path="/weekly">` in [App.tsx:1523](../../src/App.tsx#L1523), no router work needed

## Approach

Two minimal, additive changes — no API, DB, or behavioural changes to the existing surfaces:

### 1. Quick Launcher catalogue entry (mobile / `/quick`)

Append a `weekly` entry to `QUICK_LAUNCHER_CATALOGUE` in [`src/lib/quickLauncherCatalogue.ts`](../../src/lib/quickLauncherCatalogue.ts). The picker auto-renders it under "Available" so users can opt-in to pin it on `/quick`.

```ts
{
  id: "weekly",
  label: "Week Ahead",
  description: "Sunday-morning summary of tasks, weather, and what to sow.",
  icon: CalendarRange,        // new lucide import
  accent: "amber",
  route: "/weekly",
}
```

- Stable id `weekly` — must never be renamed (would orphan persisted pins).
- Not added to `DEFAULT_QUICK_LAUNCHER_PINS` — defaults stay at `["doctor","today","capture","shed"]`. Users opt in via the picker in Account Settings.
- No `isAvailable` gating — `/weekly` is universally available.

### 2. Dashboard "Week ahead" link (desktop + mobile dashboard)

In [`src/components/HomeDashboard.tsx`](../../src/components/HomeDashboard.tsx) around line 527–543 (the existing "This Week at a Glance" header row), add a small inline "Week ahead →" pill button next to the Refresh button. It uses the existing `navigate("/weekly")` pattern already imported via `useNavigate`.

```tsx
<button
  data-testid="dash-weekly-overview"
  onClick={() => navigate("/weekly")}
  className="flex items-center gap-1.5 text-xs font-bold text-rhozly-primary hover:text-rhozly-primary-dark transition-colors"
>
  <Calendar size={14} />
  Week ahead
  <ChevronRight size={12} />
</button>
```

- Lives next to `dash-refresh`, keeps the header row visually balanced.
- The `Calendar` icon is already imported at [HomeDashboard.tsx:16](../../src/components/HomeDashboard.tsx#L16); `ChevronRight` at line 14.
- `useNavigate` already destructured at the top of the component.

## Files modified

| File | Change |
|------|--------|
| [`src/lib/quickLauncherCatalogue.ts`](../../src/lib/quickLauncherCatalogue.ts) | Append `weekly` catalogue entry + `CalendarRange` icon import |
| [`src/components/HomeDashboard.tsx`](../../src/components/HomeDashboard.tsx) | Add "Week ahead →" pill button next to dashboard Refresh |

## Files NOT modified (deliberate)

- `DEFAULT_QUICK_LAUNCHER_PINS` — keep the four-pin default; the new entry is opt-in
- `App.tsx` — route already registered in Wave 21
- Side nav — `/weekly` is once-a-week content and doesn't earn a top-level nav slot

## Test coverage

- **Vitest unit**: extend [`tests/unit/lib/quickLauncherCatalogue.test.ts`](../../tests/unit/lib/quickLauncherCatalogue.test.ts) (if present; create if not) with a case asserting `weekly` is in the catalogue, has the right route, and `resolvePins(["weekly"], ctx)` returns it for every tier.
- **Playwright E2E**: add a row to [`docs/e2e-test-plan.md`](../e2e-test-plan.md) covering "Dashboard → Week ahead button → lands on /weekly". A small E2E spec or extension of the existing dashboard spec.

## App-reference docs to update

| File | Update |
|------|--------|
| [`docs/app-reference/02-dashboard/15-weekly-overview.md`](../app-reference/02-dashboard/15-weekly-overview.md) | New section under Role 1 "Component graph" listing the two new entry points; remove any "no nav entry" caveat |
| [`docs/app-reference/02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) | Update the catalogue list ("Current catalogue (15 destinations)" → 16, mention `weekly`) |
| [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) | Note the new "Week ahead →" link in the dashboard header |

## Risks / edge cases

- **Stable id**: `weekly` will be persisted in `user_profiles.quick_launcher_pins`. Renaming it post-ship would orphan pins — locking in the id now.
- **No backwards-compat work needed**: existing users with no `weekly` pin simply don't see the tile until they opt in.
- **Dashboard link visibility on tiny screens**: the header already collapses cleanly; adding one more pill won't overflow because the title wraps before the button row.

## Deploy

Trivial change (no migration, no edge function, no cron). Standard `npm run deploy` (minor bump → 21.0002) once code lands.
