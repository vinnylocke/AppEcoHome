# RHO-20 — Home Dashboard "tasks today" count is unclear + doesn't move after a walk

## Problem (from the ticket)

Sprout tier, Pixel Tablet landscape PWA, v34.0001. On the **new Home dashboard** (`/dashboard?view=home`), the "**N tasks today**" chip in the status strip doesn't visibly change after the user completes tasks in a Garden Walk (they completed 2, the chip still read as though 3 were to do). The reporter accepts the total may be *correct* (total scheduled today, not remaining) but finds a static number confusing, and asks for a **breakdown near the number**: pending / completed / overdue / skipped / postponed, and how many *overdue* were completed.

This is two distinct things:

- **A bug** — the count is *stale* after a walk (it doesn't refetch), so it looks broken even though the value would be right after a refresh.
- **An enhancement** — even when fresh, a bare "3 tasks today" total doesn't tell the gardener what they've *done* vs what's *left*. They want a breakdown.

## App-reference files consulted

- `docs/app-reference/02-dashboard/17-home-main.md` — Home view composition, status-strip props, `locationTaskCounts` source (per-card chip + summed for the strip)
- `docs/app-reference/02-dashboard/01-dashboard-tab.md` — Overview tab; `fetchDashboardData` triggers, `locationTaskCounts` / `overdueTaskCount` semantics, realtime + route-visit refetch
- `docs/app-reference/99-cross-cutting/21-routing.md` (view params / deep links) — for the `?view=` vs `pathname` refetch nuance
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — ghost tasks + Skipped tombstones + snooze semantics (to be re-read at implementation for the breakdown definitions)
- Source read: `src/App.tsx` (`fetchDashboardData` count computation + the two refetch effects), `src/components/home/HomeMain.tsx`, `src/components/home/HomeStatusStrip.tsx`, `src/components/home/QuickActionsRow.tsx`, `src/components/home/WeekPulse.tsx`, `src/components/HomeDashboard.tsx` (Overview walk-launch), `src/components/walk/GardenWalk.tsx` + `WalkStartTile.tsx` (`returnTo`), `src/components/walk/... `, `src/lib/quickLauncherCatalogue.ts`, `src/hooks/useHomeDashboardStats.ts`, `supabase/functions/_shared/dashboardStats.ts`, `supabase/functions/home-dashboard-stats/index.ts`

---

## Root cause

### 1. The stale count (the actual bug)

The status-strip number is `todayTaskCount = sum(locationTaskCounts)` — `HomeMain.tsx:76`, passed to `HomeStatusStrip` which renders "`{todayTaskCount} tasks today`" (`HomeStatusStrip.tsx:82-84`).

`locationTaskCounts` is computed **client-side in `App.tsx` `fetchDashboardData`**, not by an edge function (the `home-dashboard-stats` "location_task_counts" mentioned in the old `01-dashboard-tab.md` doc is **drift** — see the doc-drift note below). The per-location today count is built at `App.tsx:809-871` from a query that filters `.eq("due_date", todayStr).neq("status", "Completed")` plus ghost projection from blueprints. So the count is deliberately **"tasks scheduled today that are not yet Completed"** — completing a task *does* remove it from this count **once the data is refetched**. The value is correct; it just isn't refreshed.

`fetchDashboardData` is re-run on: mount, home switch, `home_data`/inventory realtime, manual refresh, and **navigating to `/dashboard`** (`App.tsx:1205-1209`, effect keyed on `routerLocation.pathname === "/dashboard"`).

The break: **the walk, when launched from the Home view, returns to `/quick`, not `/dashboard`, so that refetch never fires.**

- The walk reads `returnTo = (location.state as {from?})?.from ?? "/quick"` — `GardenWalk.tsx:178-179`. On finish it does `navigate(returnTo)` (`GardenWalk.tsx:387`, `:462`, `:489`, `:506`).
- Only two launch sites pass `state.from`:
  - `HomeDashboard.tsx:611` (the **Overview** tab's TodayFocusCard) → `from: "/dashboard"` ✅
  - `WalkStartTile.tsx:51` (`/quick`) → `from: "/quick"`
- The **new Home view** launches the walk through `QuickActionsRow` → `navigate(dest.route)` with **no `state`** (`QuickActionsRow.tsx:68-71`, catalogue entry `route: "/walk"` at `quickLauncherCatalogue.ts:124-129`). So `returnTo` falls back to `/quick`.

Result on the tablet: Home → walk (via a "Walk" quick tile) → complete 2 → walk finishes → lands on `/quick` (or the user navigates back to Home manually). Because the walk never returned to `/dashboard`, `fetchDashboardData` didn't re-run, and the strip still shows the pre-walk count.

Secondary nuance (defence-in-depth): even the `pathname`-keyed refetch effect only fires on a `pathname` *change*. Going `/dashboard?view=home` → `/walk` → `/dashboard?view=home` **does** change `pathname` (`/dashboard`↔`/walk`), so that path would refetch. The failure here is specifically the `returnTo=/quick` redirect, not the effect key — but if we ever launch the walk *without* leaving `/dashboard`, the effect wouldn't catch it (it ignores `?view=`/`?search` changes). Worth noting; not the primary fix.

Realtime is *supposed* to be the live-update backstop — completing a task writes a `tasks` row, which the home-scoped `DashboardRealtimeSubscriber` should pick up and refetch. If that fired reliably the count would update regardless of route. The report ("still reads 3") suggests realtime did **not** refresh the strip in this session (walk completions may be written from a route where the dashboard subscriber is torn down, or the focus-mode `/walk` route unmounts the subscriber). To confirm at implementation: is `DashboardRealtimeSubscriber` mounted during `/walk`? `App.tsx:2155` hides chrome on `/walk`; if the realtime provider is inside that hidden subtree, no live task events reach the dashboard during the walk, and nothing forces a refetch on return.

### 2. The missing breakdown (the enhancement)

The strip shows only the not-yet-done total. There is **no** completed / overdue-completed / skipped / postponed breakdown anywhere on the Home view's headline. What exists:

- **Already computed & already fetched on the Overview + WeekPulse path** via `home-dashboard-stats`:
  - `tasks.total / overdue / pending / completed / completedThisWeek / priorOverdue` — `useHomeDashboardStats.ts:22-37`, computed in `computeTaskStats` (`_shared/dashboardStats.ts:140-174`).
  - `dayStrip[]` per day: `total / completedOnTime / completedLate / overdue / pending` — `computeDayStrip` (`_shared/dashboardStats.ts:195-281`). The **today** column already has completed-on-time, completed-late, overdue, and pending **for today**.
- **Not yet computed anywhere:** per-day (or today-specific) **skipped** and **postponed/snoozed** counts. `computeDayStrip` explicitly `continue`s on `t.status === "Skipped"` (`dashboardStats.ts:243`) so skipped tasks are never bucketed, and a snooze/"Not yet" shifts a task's *effective* due date forward (`effectiveDueDate`, `dashboardStats.ts:50-55`) rather than being counted as "postponed today". So "how many skipped / postponed today" needs new aggregation.
- **"Overdue completed today"** ≈ the today column's `completedLate` (a task completed after its due day). That maps to the reporter's "how many overdue were completed" for *plain* tasks; harvest-window "late" has its own definition. Good enough to surface; confirm wording at implementation.

So ~4 of the 6 requested chips (pending, completed, overdue, overdue-completed) are **derivable from the existing today `dayStrip` column with zero new server work**; **skipped** and **postponed** need a small `dayStrip` extension (or a dedicated today-summary).

### Doc drift found (fix in this task)

`docs/app-reference/02-dashboard/01-dashboard-tab.md` (Data flow §1, and the output-shape block ~lines 91-105 / 150-153) states `home-dashboard-stats` returns `location_task_counts` and `overdue_count`. The **current** `home-dashboard-stats/index.ts` returns no such fields (`index.ts:357-404`); `locationTaskCounts` + `overdueTaskCount` are computed client-side in `App.tsx` `fetchDashboardData` from the `homes` query. Correct the doc to describe the real source.

---

## Proposed fix — two phases

### Phase A — the bug: make the count fresh after a walk

Goal: after completing tasks in a walk launched from Home, the strip reflects the new remaining count on return.

Options (pick at implementation; **A1 is the minimal, lowest-risk fix**):

- **A1 (recommended): give the Home-launched walk a `returnTo` of `/dashboard`.** Thread `state.from` through the launcher when the destination is `/walk`. Cleanest spot: in `QuickActionsRow` `onClick`, pass `navigate(dest.route, dest.route === "/walk" ? { state: { from: "/dashboard" } } : undefined)` — or generalise the catalogue with an optional `launchState`. This makes the walk return to `/dashboard`, which re-fires the existing `App.tsx:1205-1209` refetch effect (pathname changes `/walk`→`/dashboard`). Zero new data plumbing.
  - Caveat: if the user is on the *mobile* `/quick` surface, they should still return to `/quick`. Since `QuickActionsRow` only renders on the Home dashboard, `from:"/dashboard"` is correct there; `WalkStartTile` (on `/quick`) keeps `from:"/quick"`. No conflict.
- **A2 (belt-and-braces): force a refetch on *return to `/dashboard`* regardless of walk.** Broaden the refetch effect so a `?view=` change (not just a `pathname` change) also refetches when already on `/dashboard`, OR add a `location.key`-keyed refetch. Low value if A1 lands, but closes the "walk that never left /dashboard" gap. Only take if A1 proves insufficient on-device.
- **A3 (root backstop): ensure `DashboardRealtimeSubscriber` catches walk task completions.** If the subscriber is unmounted under `/walk`, task completions during the walk never trigger a live refetch. Verify mount lifecycle; if it's torn down, the returning-route refetch (A1) is the pragmatic fix and A3 is optional hardening. **Do not** rearchitect realtime for this ticket unless A1+A2 still leave a repro.

**Recommendation: ship A1 alone first** — it directly fixes the reported repro with one small, well-scoped change. Keep A2/A3 as documented fallbacks.

### Phase B — the enhancement: a breakdown near the count

Reframe the headline and add a chip breakdown so a static total makes sense.

**Headline reframe (recommended):** change "`N tasks today`" → "`X of Y done today`" (X = completed today, Y = total scheduled today), so the number *moves* as tasks complete and the total-vs-remaining confusion disappears. Keep the tap-through to `?view=calendar`.

**Breakdown chips (recommended set):** a compact secondary row / inline chips under the headline showing today's:
- **Pending** (remaining) — today `dayStrip.pending`
- **Completed** — today `dayStrip.completedOnTime + completedLate`
- **Overdue** — today `dayStrip.overdue` (or the home-wide `overdueTaskCount` already on the strip — decide whether "overdue" here means *today's* overdue or *all* overdue; the existing separate red "overdue" chip is home-wide, so scope the breakdown chip to **today** to avoid double meaning)
- **Overdue completed** — today `dayStrip.completedLate`
- **Skipped** — *needs new aggregation* (see below)
- **Postponed** — *needs new aggregation* (see below)

Hide zero-count chips to keep it calm for new gardeners (Sprout persona sees mostly "3 to do, 0 done" early on; the value grows as they act).

**Data source decision:**

- **Prefer extending the existing `home-dashboard-stats` `dayStrip`** (server-side, Deno-tested) over a second client computation — single source of truth, already fetched by WeekPulse in detailed mode. Add to `computeDayStrip` per-day (or a dedicated `todaySummary`): `skipped` (count `status === "Skipped"` bucketed on effective due day — currently `continue`d) and `postponed` (tasks whose `next_check_at`/snooze moved them off their original due day; define precisely against `04-data-model-tasks.md`). `completed` (=onTime+late) and `overdue`/`pending` are already there.
- **But note the mount cost:** WeekPulse (and thus `useHomeDashboardStats`) is **only mounted in detailed mode** (`HomeMain.tsx:188`). Simple-mode Sprout users — the reporter's tier — would **not** have this data unless we also fetch it. Two sub-options:
  - **B1:** mount a lightweight `useHomeDashboardStats` call in `HomeMain` for the breakdown in *both* densities (accept one extra edge-function fetch on Home; it's cached/soft-failing like WeekPulse). Cleanest for the "single source of truth" rule.
  - **B2:** compute the today breakdown **client-side in `App.tsx`** alongside `locationTaskCounts` (we already fetch today's tasks there at `App.tsx:809-814` — extend that query to include Completed/Skipped for today and bucket them). Avoids a new fetch entirely, but duplicates status-bucketing logic that already lives in `dashboardStats.ts`, risking drift. Deno tests wouldn't cover the client path.
  - **Recommendation: B1** — reuse the tested server aggregation; extend `dayStrip` (today column) with `skipped` + `postponed`; surface the today column in the strip. The extra fetch is acceptable (already the pattern for WeekPulse, soft-fails, cached).

**Scope note:** Phase B is an enhancement; if the reporter is satisfied by just the count going live (Phase A) + the "X of Y done" reframe, the full skipped/postponed chips can be a smaller follow-up. Recommend shipping **A1 + the "X of Y done today" reframe + pending/completed/overdue-completed chips (all zero-new-server-work)** together, and treating **skipped + postponed** (the only bits needing a `dayStrip` extension) as an optional B-tail if we want the full requested set.

---

## Open questions for the human

1. **Headline wording:** switch "`N tasks today`" → "`X of Y done today`"? (Recommended — makes the number move, kills the confusion at the source.) Or keep the total and only add chips?
2. **Exact chip set:** ship the 4 free ones (pending / completed / overdue-completed / overdue) now and defer **skipped + postponed** (the two needing a server change) to a follow-up? Or do all 6 in one go (extends `computeDayStrip`)?
3. **"Overdue" meaning on Home:** the strip already has a home-wide red "N overdue" chip. Should the breakdown's overdue be *today-scoped* (from `dayStrip`) to avoid two "overdue" numbers with different meanings, or reuse the home-wide one?
4. **"Postponed" definition:** count tasks whose snooze/`next_check_at` moved them off today, or a distinct "Postpone" action if one exists? (Needs an `04-data-model-tasks.md` re-read; snooze currently just shifts effective due date, so "postponed today" isn't a first-class status yet.)
5. Confirm whether A1 alone fixes the on-device repro before adding A2/A3.

---

## Files that will change (indicative — confirmed at implementation)

**Phase A (bug):**
- `src/components/home/QuickActionsRow.tsx` — pass `state:{from:"/dashboard"}` for the `/walk` destination (or add an optional `launchState` to the catalogue and thread it).
- (A2 only, if needed) `src/App.tsx:1205-1209` — broaden the return-to-dashboard refetch trigger.
- Possibly `src/lib/quickLauncherCatalogue.ts` — optional `launchState` field on catalogue entries.

**Phase B (enhancement):**
- `supabase/functions/_shared/dashboardStats.ts` — extend `computeDayStrip` / add a today-summary with `skipped` + `postponed` (only if we do the full set).
- `supabase/functions/home-dashboard-stats/index.ts` — surface the new fields.
- `src/hooks/useHomeDashboardStats.ts` — type additions.
- `src/components/home/HomeStatusStrip.tsx` — reframed headline + breakdown chips.
- `src/components/home/HomeMain.tsx` — (B1) mount the stats hook for both densities / pass today-summary to the strip.

## Tests (mandatory)

- **Deno** (`supabase/tests/dashboardStats.test.ts`) — new cases for the `skipped` + `postponed` today aggregation if `computeDayStrip` is extended.
- **Vitest** — the headline "X of Y done" formatting + zero-chip-hiding logic (extract a pure helper so it's unit-testable).
- **Playwright** (`tests/e2e/specs/home-main.spec.ts` + `HomeMainPage.ts`) — (a) breakdown chips render with seeded today tasks of mixed status; (b) **regression for the bug**: complete a task then assert the count/breakdown updates on return from the walk (mock or seed a Completed transition). Add `data-testid`s to every new chip.

## Docs to update

- `docs/app-reference/02-dashboard/17-home-main.md` — status-strip now shows a breakdown; note the new data source (stats hook mounted in both densities) and the walk `returnTo=/dashboard` behaviour.
- `docs/app-reference/02-dashboard/01-dashboard-tab.md` — **fix the drift**: `home-dashboard-stats` does NOT return `location_task_counts`/`overdue_count`; those are client-computed in `App.tsx`. Also note the new `dayStrip` fields if added.
- `docs/e2e-test-plan/30-home-main.md` — new test rows for the breakdown chips + the walk-return freshness regression.
- `TESTING.md` — test counts if a new spec/case is added.
- (if `computeDayStrip` gains fields) any cross-links in `99-cross-cutting/04-data-model-tasks.md` describing today-strip semantics.
