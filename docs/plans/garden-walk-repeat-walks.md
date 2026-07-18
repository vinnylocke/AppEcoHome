# Garden Walk — repeat walks: "Start fresh" actually starts fresh

**Date:** 2026-07-18
**Bug:** After completing a walk, the resume prompt's **Resume** and **Start fresh** both land
on the "nothing left to walk" empty screen. **Product ask:** users may walk the garden more
than once a day — a completed walk must not lock the feature until midnight.

## Root cause

`buildWalkRoute` (`src/lib/gardenWalk.ts:1470-1592`) fetches **all of today's sessions** for
the user and excludes every section marked `section_done` and every plant visited today —
by design for mid-walk rebuilds and "Walk what's left". But the **Start fresh** path
(`GardenWalk.tsx` `bootstrap({ forceFresh })`) only closes the open session; the rebuilt route
still applies the day-scoped filter, so after a fully-walked day it composes to zero steps →
`empty` state. Resume has the same outcome (everything in the session is already done). Even
without the resume prompt, re-opening the walk after a completed session goes straight to the
empty screen for the same reason. The empty screen offers only "Back" — no way out.

## App-reference files consulted

- `docs/app-reference/02-dashboard/13-garden-walk.md` (route composition, same-day rebuild
  semantics, resume prompt, summary card, sessions model)
- Code trace: `src/lib/gardenWalk.ts` (buildWalkPlants `visitedTodaySet` filter :204-284,
  sessions query :1470-1475, section visits :1576-1592), `src/components/walk/GardenWalk.tsx`
  (bootstrap :206-266, empty state :481-499), `src/services/walkService.ts` (sessions),
  `WalkSummaryCard.tsx` ("Walk what's left").

## Design

Introduce an explicit **fresh-walk mode** that ignores today's progress, and offer it wherever
the user can express "walk again":

| Surface | Behaviour after fix |
|---|---|
| Resume prompt → **Resume** | Unchanged — continues the open session with progress applied. |
| Resume prompt → **Start fresh** | Closes the open session AND rebuilds **ignoring today's progress** → full route. "Fresh" finally means fresh. |
| Summary card → **Walk what's left** | Unchanged — day-scoped filter (skipped sections reappear, done don't). |
| Summary card | Gains **"Start a full walk"** secondary action → fresh-mode bootstrap (new session). |
| Empty ("nothing left") screen | When the emptiness was caused by progress filtering (not a genuinely walkless home), gains **"Walk everything again"** → fresh-mode bootstrap. A home with no walkable content keeps just "Back" (no loop-to-empty button). |

Sessions already support multiples per day (each walk is its own row; summary metrics
per-session) — no schema change.

## Source changes

1. **`src/lib/gardenWalk.ts`**
   - `buildWalkRoute(homeId, userId, settings, opts?: { ignoreTodayProgress?: boolean })`:
     when set, skip the sessions/section-visits queries (pass `sectionVisits: []`) and thread
     the flag into `buildWalkPlants`, which keeps `latestVisitByItem` / `allGoodWithinWindow`
     enrichment (display metadata) but **skips the `visitedTodaySet` exclusion filter**.
   - `WalkRoute` gains `filteredByProgress: boolean` — true when the day-scoped build actually
     excluded something (any today-visit or `section_done` row). Lets the empty state decide
     whether "Walk everything again" makes sense.
2. **`src/components/walk/GardenWalk.tsx`**
   - `bootstrap` accepts `ignoreTodayProgress` and passes it to `buildWalkRoute`; the resume
     prompt's Start fresh handler sets it (with `forceFresh`).
   - Empty state: conditional **"Walk everything again"** button
     (`data-testid="garden-walk-empty-again"`) shown when `route.filteredByProgress` — the
     empty dispatch carries the flag (reducer `empty` action gains it).
   - Summary card handler for the new **"Start a full walk"** action → `bootstrap({ ignoreTodayProgress: true })`
     (session already ended, so no forceFresh needed).
3. **`src/components/walk/WalkSummaryCard.tsx`** — render the secondary action
   (`data-testid="walk-summary-full-walk"`) alongside "Walk what's left".

## Tests

- **Vitest** (`tests/unit/lib/gardenWalk.test.ts`, extend):
  - `buildWalkPlants` with today-visits + `ignoreTodayProgress: true` → previously-excluded
    plants present, `lastVisited` metadata still populated; flag false → excluded (regression
    pin).
  - `composeWalkRoute` with `section_done` visits vs empty visits — steps reappear in fresh
    mode (already covered by passing `sectionVisits: []`; assert the `filteredByProgress`
    derivation helper: excluded-something → true, nothing-excluded → false).
- **Deno:** none (client-only).
- **Playwright** (`garden-walk.spec.ts`, new WALK-027): complete the whole seeded walk (loop
  Continue/all-good until the summary), tap **Start a full walk** → walking state with steps;
  exit, re-enter `/walk` → empty screen shows **Walk everything again** → walking state again.
  Page Object gains the two new locators.

## Test documentation updates

- `docs/e2e-test-plan/29-garden-walk.md` — WALK-027 row; note on fresh-mode semantics.
- `TESTING.md § Current Test Inventory` — gardenWalk.test.ts + garden-walk.spec.ts counts.

## App-reference updates (same task)

- `02-dashboard/13-garden-walk.md` — fresh-walk mode semantics table (Resume vs Start fresh vs
  Walk what's left vs full walk), empty-state button, multiple-walks-per-day support,
  `filteredByProgress` contract.

## Risks / edge cases

- Fresh mode must NOT affect mid-walk same-day rebuilds (task complete → rebuild) — the flag
  is only set from the three explicit user actions.
- A fresh walk re-surfaces plants marked "all good" earlier today — intended ("couple a day"
  means re-checking); tasks completed earlier stay completed (task list is date-driven, not
  visit-driven).
- `filteredByProgress` must be false for a genuinely walkless home so the empty state can't
  offer a button that loops to empty.
- Multiple same-day sessions were already possible via "Walk what's left" — dashboards/streaks
  reading `garden_walk_sessions` already tolerate >1 row/day (summary metrics are per-session).

## Out of scope

- Any schema change (none needed).
- Changing "Walk what's left" semantics (correct as-is).
- The dashboard start-tile copy (it has no done-today lockout).

## Implementation notes (2026-07-18)

- **Extra root-cause fix found while implementing:** a route composing to zero steps left its
  just-created (or resumed) session **open forever** — that orphan open session is what
  produced the user's phantom "Resume or start fresh?" prompt after a *completed* walk. The
  bootstrap now closes the session whenever the built route is empty.
- `visitedTodayIds` extracted as a shared pure helper so the exclusion filter and the
  `filteredByProgress` derivation can't drift; `buildWalkList` now returns
  `{ plants, anyVisitedToday }` (single caller updated).
- Empty-state copy differentiates: "You've walked everything today" (with the button) vs the
  original add-plants guidance for walkless homes.
- WALK-025 flaked once in the full-suite run (passed on retry; 3/3 clean in isolation) —
  pre-existing suite-ordering timing on the resume flow, not introduced here.

## Code review outcome (2026-07-18)

Fresh `code-reviewer` verdict: **ship** — no medium/high findings. All three low findings handled:

- **Applied:** the summary's "Start a full walk" now passes `forceFresh` like the other two
  fresh launchers — without it, a silently-failed `endSession` would bounce the explicit
  full-walk request into a Resume prompt.
- **Documented:** a resumed-then-empty session is closed with default rollup metrics
  (`garden_walk_visits` rows stay the source of truth — matches existing stale-close
  behaviour); `anyVisitedToday` deliberately ignores `skipIndoor` (worst case after a mid-day
  toggle is one extra empty state that degrades to the plain copy, never a loop).
- Reviewer explicitly verified: superseded-guard ordering can't close a newer bootstrap's
  session; the finish path keeps full metrics (no double-close); fresh-mode's resolved-empty
  query stand-in is shape-compatible; Resume / Walk what's left stay day-filtered; reducer
  exhaustiveness holds; `completeEntireWalk` terminates on every plant-card variant.

## Release notes

Add under next bump: "Walk your garden as many times a day as you like — 'Start fresh' now
truly starts a full walk, and the end-of-walk screen offers 'Start a full walk' alongside
'Walk what's left'."
