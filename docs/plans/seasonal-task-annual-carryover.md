# Plan — Seasonal Task Annual Carry-Over + Per-Year Completion

**Status:** Awaiting approval
**Author investigation:** two multi-agent sweeps (daily-brief suppression + carry-over model), 2026-07-23

## Problem

Three user-reported symptoms turned out to share one root cause:

1. **The daily brief keeps nagging "harvest/pruning window is open" after the user has completed that window** — the brief reads blueprint *date ranges* and never checks the completed task.
2. **Nothing shows next year on the calendar** for harvest/pruning (e.g. strawberries) — the blueprint's window is a **frozen single-year `[start_date, end_date]`** span that doesn't intersect any next-year date.
3. **Seasonal watering has an `end_date` that should mean "close this season", but currently means "stop forever"** — so it also dies after one year.

**Root cause:** `public.task_blueprints` stores **frozen absolute single-year dates** (`start_date` / `end_date`). There is **no annual recurrence anywhere**. Seasonal intelligence (season → MM-DD, hemisphere) lives only on the separate `plant_schedules` *template* table and is baked down to concrete current-year dates at blueprint-creation time. The ghost engine hard-stops at `end_date` in three places (`taskEngine.buildRenderTasks` window branch + the `> end_date break` in the frequency branch; `locationTaskCounts` `today > end_date → return`), and `generate-tasks` skips window types and only materialises `today + 7d`. Completion suppression is **blueprint-scoped, not year-scoped**, so even if dates rolled, completing 2026 would suppress every future year.

**Note:** frequency tasks with *no* `end_date` already recur indefinitely — only `end_date`/window routines (harvest, pruning, seasonal watering) expire.

## Locked decisions (from the user)

1. **Fixed calendar boundaries** — same MM-DD every year, only the year changes. No weather/frost adaptation now (it's a clean later evolution; a frost cache already exists).
2. **Both mechanisms for recurrence:** schedule-generated routines derive their default from the plant **lifecycle** (perennial → recurs annually; annual → single; biennial → capped at 2 years), **and** a manual **"repeat every year" opt-in toggle** for hand-authored routines.
3. **Calendar projects future years** (capped at current + N years); dashboard **stats/brief stay near-term** (the materialised `today + 7d` horizon), with literal-date server queries rolled into the current year.
4. **Manual `end_date` = terminal stop unless the user ticks "repeat annually."** One-off routines never silently start repeating.

## App-reference files consulted

- [99-cross-cutting/39-garden-brain.md](../app-reference/99-cross-cutting/39-garden-brain.md) — daily-brief contract (the `windows` signal, scoring, AI rewrite)
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — ghosts, materialisation, seasonal window-task semantics (Wave 20 / Pruning 2026-07)
- [99-cross-cutting/29-seasonality.md](../app-reference/99-cross-cutting/29-seasonality.md) — season → MM-DD resolution, hemisphere shift
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `generate-tasks`, `generate-daily-brief`, `generate-weekly-overviews` crons
- [99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- [02-dashboard/03-calendar-tab.md](../app-reference/02-dashboard/03-calendar-tab.md) — TaskCalendar
- [04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md) — recurring-template authoring, "Next:" preview
- [08-modals-and-overlays/02-task-modal.md](../app-reference/08-modals-and-overlays/02-task-modal.md), [08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — window-task actions, per-plant routine authoring
- [02-dashboard/05-daily-brief-card.md](../app-reference/02-dashboard/05-daily-brief-card.md) — retired legacy hero (context only)

---

## The model

Add one column to `task_blueprints`:

```
recurrence_kind text NOT NULL DEFAULT 'once'
  CHECK (recurrence_kind IN ('once','annual','lifecycle_capped'))
recurs_until date NULL   -- terminal year for lifecycle_capped (biennial etc.); NULL = uncapped
```

Semantics:

| `recurrence_kind` | Meaning | Ghost engine behaviour |
|---|---|---|
| `once` | Terminal — today's behaviour | Stops at `end_date`. Manual routines default here. |
| `annual` | Repeats every year on the same MM-DD | Projects one occurrence per year (window ghost or in-window frequency grid), capped at current + N years. Perennials + opted-in manual routines. |
| `lifecycle_capped` | Repeats annually until `recurs_until` | Like `annual` but stops after `recurs_until` (biennials → +2yr). |

**The blueprint's stored `start_date` / `end_date` become the *template* month/day for the first window.** The engine rolls that MM-DD into each occurrence year — it never mutates the stored dates. Because each projected occurrence embeds its year in `due_date` (and thus in the ghost id `ghost-{bp.id}-{YYYY-MM-DD}`), the existing `unique_blueprint_date` UNIQUE(`blueprint_id`, `due_date`) index **year-scopes completion automatically**: 2026's `Completed`/`Skipped` row cannot collide with or suppress 2027's occurrence.

Default derivation (schedule-generated, in `plantScheduleGenerator.buildBlueprintFromSchedule`):
- perennial → `annual`
- annual → `once`
- biennial → `lifecycle_capped`, `recurs_until = start + 2yr`

Manual authoring default = `once`; the "repeat every year" toggle sets `annual`.

---

## Track A — Daily-brief completed-window suppression (ships first, self-contained)

Small, adversarially verified (verdict: SOUND). Independently valuable, and correct both before and after Track B because it keys on the *task's* `window_end_date >= today`, which Track B makes year-accurate.

### Changes

1. **`supabase/functions/generate-daily-brief/index.ts`**
   - Add `id` to the `windowBps` select (currently `title, task_type, start_date, end_date` → `id, title, task_type, start_date, end_date`). **Required** — without it there is no key to match against.
   - Add a query to the `gatherSignals` `Promise.all` for resolved window tasks:
     ```ts
     db.from("tasks")
       .select("blueprint_id")
       .eq("home_id", homeId)
       .in("status", ["Completed", "Skipped"])
       .not("blueprint_id", "is", null)
       .not("window_end_date", "is", null)
       .in("type", ["Harvesting", "Harvest", "Pruning"])
       .lte("due_date", today)
       .gte("window_end_date", today)
     ```
   - Build `resolvedWindowBlueprintIds = new Set(...)` and drop those blueprints from the `windows` signal via the new pure helper below.
2. **`supabase/functions/_shared/dailyBrief.ts`** — add a small pure exported helper `dropResolvedWindows(windows, resolvedBlueprintIds)` so the drop is Deno-testable without contaminating `assembleBrief` (no signature change to `BriefSignals`/`assembleBrief`). `gatherSignals` owns the impure task-status query; the helper does the filtering.

### Why the query is correct (from adversarial verify)
- `window_end_date >= today` scopes "done" to **this** year's cycle — last year's completed window (`window_end_date < today`) is excluded, so next year's window legitimately re-opens.
- A `Pending` materialised task does **not** suppress (window genuinely still open — correct to show).
- A pure-ghost blueprint with no task row is unaffected (correctly still shown).
- `.lte("due_date", today)` is load-bearing: it prevents a pre-window postpone/skip tombstone from false-suppressing a window the user hasn't finished.
- Two accepted, non-breaking gaps: (a) completing *before* the window opens still shows "opens in N days" — the safer trade-off; (b) grandfathered pre-Wave-20 rows with `window_end_date = NULL` aren't suppressed (new completions always carry it).

### Tests (`supabase/tests/dailyBrief.test.ts`)
- DB-020: window whose blueprint id is in the resolved set is dropped; others pass through unchanged (order + `opensInDays` preserved).
- DB-021: empty resolved set is a no-op.
- DB-022: keyed per blueprint id — two windows, one resolved, drops only the resolved one.
- DB-023: composed into `assembleBrief` — sole open window resolved ⇒ no `window` item and `stats.windowsOpen === 0`.

### Docs
- **39-garden-brain.md** — amend the Generator bullet: `gatherSignals` now drops a harvest/pruning window from the `windows` signal once its task is `Completed`/`Skipped` and still covers today; note the suppression lives in the generator because pure `assembleBrief` only renders what it's handed.
- **04-data-model-tasks.md** — add the Daily Brief as a consumer of the window-task completion contract in the "Seasonal window-task semantics" section, cross-linking 39.

---

## Track B — Annual carry-over (the feature)

Recommended approach: **per-year projection in the ghost engine** (no destructive migration, works offline, year-scoped completion by construction). Phased so each phase is independently testable.

### Phase B1 — Schema
`supabase/migrations/<ts>_blueprint_recurrence_kind.sql`:
- Add `recurrence_kind` + `recurs_until` (as above), with a `COMMENT`.
- **Backfill:** existing `is_recurring = true` seasonal-window blueprints (`task_type IN (Harvesting,Harvest,Pruning)` with `end_date`) and schedule-derived seasonal-frequency blueprints → `annual` (the user wants these to recur). Everything else (manual literal `end_date`, one-offs) → `once`.
- No new table ⇒ no Data-API grants needed (adding a column to a grandfathered table). Apply locally with `supabase migration up` first; push only on explicit go-ahead. **Do not** `db reset`.
- **Open item for approval:** the backfill default for existing windows — blanket `annual`, or refine `lifecycle_capped` from the linked plant's lifecycle where known. Recommend blanket `annual` (matches the reported desire) + refine later.

### Phase B2 — Ghost engine per-year projection (core)
- **`src/lib/windowTasks.ts`** — add a companion predicate/helpers for "recurs annually" and a pure `projectAnnualWindows(bp, rangeStart, rangeEnd, cap)` that rolls the template MM-DD into each year the render band touches. Reuse the wrap logic (window end +1yr when it crosses the year boundary) from `plantScheduleGenerator`/`scheduleFromSchedulableTask`; leap-safe `addYears`. Cap emitted years (mirror the existing 400-day guard) to bound volume.
- **`src/lib/taskEngine.ts` (`buildRenderTasks`)** — the load-bearing edit:
  - Seasonal-window branch: for `recurrence_kind IN (annual, lifecycle_capped)`, emit **one ghost per projected year** in range (year-embedded id/`due_date`/`window_end_date`) instead of one at the literal span; respect `recurs_until`.
  - Frequency branch: replace `if (bp.end_date && ghostDateStr > bp.end_date) break;` with **roll-to-next-annual-window** for `annual`/`lifecycle_capped` (grid runs inside each year's `[start_Y, end_Y]`); keep the terminal break for `once`.
  - **Year-scope `hasWindowTask`** (and tombstone checks): test "does any real/Skipped task's `due_date` fall in **this projected year's** `[windowStart_Y, windowEnd_Y]`?" — not the literal blueprint span. This is what stops completing one year from suppressing all years.
  - Must stay pure-JS and byte-identical online and against the offline snapshot.
- **`src/lib/taskActions.ts` / `taskMutations.ts`** — `materialiseGhost`/`buildGhostPayload` already copy `due_date` + `window_end_date` from the ghost; verify they carry the **rolled** per-year values so the `unique_blueprint_date` INSERT is year-distinct (else year-2 completion 23505s and the fallback overwrites year-1 — data loss).
- **`src/lib/locationTaskCounts.ts`** — replace `today > end_date → return` and the literal in-window check with the current-year projected window.
- **`supabase/functions/generate-tasks/index.ts`** — mirror the projection: keep skipping window types (frontend owns windows) but don't let `end_date` terminate an `annual` frequency routine; resume in next year's window. Keep the `SEASONAL_WINDOW_TYPES` mirror in sync with `windowTasks.ts`.
- Tests: `tests/unit/lib/taskEngine.test.ts`, `taskEngineOffline.test.ts`, `locationTaskCounts.test.ts` — per-year projection, year-scoped suppression, wrap windows, `recurs_until` cap, offline parity.

### Phase B3 — Server surfaces roll window into current year
- **`generate-daily-brief` `windowBps`** — roll the template `[start_date, end_date]` into the current year before the `start_date <= today+3 / end_date >= today` filter and the `opensInDays` computation (otherwise a year-1 template never matches / goes negative). Track A's suppression query is unaffected (keys on the task row).
- **`generate-weekly-overviews`** — same roll for `harvest_this_week` / `prune_this_week`.
- Leave `dashboardStats` / `home-dashboard-stats` on persisted rows (near-term horizon, per decision #3) — documented ghost blind-spot; future-year windows appear once `generate-tasks` materialises them.
- Tests: `supabase/tests/dailyBrief.test.ts`, `dashboardStats.test.ts` extensions.

### Phase B4 — Authoring UI + lifecycle default
- **`src/lib/plantScheduleGenerator.ts`** — set `recurrence_kind` from lifecycle (perennial→`annual`, annual→`once`, biennial→`lifecycle_capped`+`recurs_until`).
- **`src/components/BlueprintManager.tsx`** — "repeat every year" toggle (authoring); make the "Next:" label + 30-day dot track annual-aware (currently steps by frequency and stops at `end_date`). `data-testid` on the toggle.
- **`src/components/AddTaskModal.tsx`** + **`src/components/InstanceCareRoutine.tsx`** — "repeat every year" toggle; manual `end_date` stays terminal unless ticked (decision #4).
- **`src/components/PlantScheduleGenerateTasksModal.tsx`** — preview reflects annual re-projection.
- Tests: E2E `tests/e2e/specs/schedule.spec.ts`, `harvest-window.spec.ts` — author an annual routine, navigate to next year, see the window; Page Object updates for new toggles.

### Phase B5 — Docs, seeds, test plan
- **04-data-model-tasks.md** — document `recurrence_kind` / `recurs_until`, per-year projection, year-scoped completion.
- **29-seasonality.md** — annual re-projection uses fixed boundaries; also fix the two drift items the sweep found: `getSeason` doesn't exist and `buildAutoSeasonalSchedules` lives in `plantScheduleFactory.ts`, not `seasonal.ts`.
- **11-cron-jobs.md**, **03-calendar-tab.md**, **07-blueprint-manager.md**, **02-task-modal.md**, **08-instance-edit-modal.md** — reflect annual recurrence + the authoring toggle.
- **`supabase/seeds/03_tasks_blueprints.sql`** — add an `annual` seasonal blueprint fixture; update `docs/e2e-test-plan/` rows + `01-seeded-fixtures.md`.

---

## Risks & mitigations

- **`end_date` semantic overload** — solved by the new `recurrence_kind` column; we never globally reinterpret `end_date`.
- **`unique_blueprint_date` data loss** — mandatory per-year `due_date`s (year embedded); covered in B2.
- **Cross-year tombstone leakage** — year-scoped `hasWindowTask`; a prior-year Skipped/Completed row (earlier-year `due_date`) must not fall in the current year's projected range.
- **Wrapping windows** (Nov→Feb southern summer, harvest crossing year boundary) — reuse existing wrap logic; naive year substitution inverts the window.
- **Runaway projection volume** — cap future years (mirror the 400-day guard).
- **Re-projection stability** — anchor the roll on the stable template MM-DD so an edit doesn't resurrect a Skipped occurrence at a new `due_date`.
- **Offline parity** — projection is pure-JS, identical online/offline.
- **Server ghost blind-spot** — accepted per decision #3; documented.

## Release notes
- Track A: minor bump — "The daily brief no longer reminds you about harvest/pruning windows you've already finished."
- Track B: major bump (`--bump-major`) — "Seasonal routines (harvest, pruning, seasonal watering) now repeat every year, and completing this year no longer clears next year."

## Sequencing / gates
Ship **Track A first** (small, verified). Then Track B by phase, each gated on `npm run typecheck` + `npm run check:schema` + `npm run build` and its tier of tests. Deploy per `docs/deployment.md` (`npm run deploy`) only on explicit go-ahead.

## Resolved decisions (approved 2026-07-23)
1. **Backfill default** — blanket `annual` for existing `is_recurring` seasonal windows; refine `lifecycle_capped` from plant data later.
2. **Future-year cap** — **5 years** ahead, exposed as a single easily-amendable named constant (e.g. `ANNUAL_PROJECTION_MAX_YEARS = 5` in `windowTasks.ts`, mirrored in the `generate-tasks` Deno copy).
3. **"Repeat every year" toggle** — offered on the **edit path too**, not creation-only.
