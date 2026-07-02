# RHO-17 — Garden Walk v2: hierarchical route with tasks, sensors, readings, plans & watchlist

**Ticket:** RHO-17 "Add More detail to garden walk" (Feature)
**Status target:** In Planning → awaiting human approval. **No code in this task.**

---

## 1. Goal + ticket summary

Today the Garden Walk is a flat plant-by-plant card deck. The ticket asks for a **hierarchical route** that mirrors how a gardener physically moves through their garden, so that *a whole day's gardening is completable inside the walkthrough*:

1. **HOME step** — sensors/valves not assigned to any plant/area/location, unassigned tasks, plus a "things to look out for" digest (watchlist) and active plans.
2. **Each LOCATION** — its own sensors/valves/tasks.
3. **Each AREA within the location** — same, plus **manual soil readings capture** (soil temp, moisture — stamped with current date/time).
4. **PLANT cards** (the existing experience) — including a final section for plants not assigned to any area/location.

At **every** step: sensor/valve values + states, tasks with **complete / postpone / skip** actions, and journal/note capture. Users can **skip sections and return later**. Copy and density adapt to the two personas (**new gardener** vs **experienced**).

## 2. App-reference files consulted

- `docs/app-reference/02-dashboard/13-garden-walk.md` — current walk contract (component graph, bands, session/visit writes, return-navigation RHO-7/8, sheet focus RHO-6, tier gating)
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — `devices` / `device_readings` (family-typed jsonb), `latest_device_readings(p_home_id)` RPC, `valve_events`, `automation_valve_queue`, battery columns, and the **home-overview consumer note** (per-area sensor/valve chip derivation)
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — tasks vs blueprints vs ghosts, materialisation, `unique_blueprint_date`, harvest window semantics (`window_end_date`, `next_check_at`), postpone/skip semantics
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md` — `ailments` (per-home watchlist) vs `plant_instance_ailments` (per-plant links)
- `docs/app-reference/99-cross-cutting/05-data-model-plans.md` — plan `status`, `kind`, `staging_state` (incl. `linked_area_id`)
- `docs/app-reference/99-cross-cutting/07-data-model-media.md` — `plant_journals` (**`inventory_item_id` is nullable** — Quick Capture precedent for unassigned notes), buckets

Source read end-to-end: `src/components/walk/GardenWalk.tsx`, `WalkPlantCard.tsx` (+ app-ref coverage of `WalkSummaryCard`/`WalkStartTile`), `src/lib/gardenWalk.ts`, `src/services/walkService.ts`, `supabase/migrations/20260521150000_garden_walk.sql`, `src/lib/taskMutations.ts` (`buildGhostPayload`), `src/components/TaskList.tsx` (complete/postpone/skip mechanics, lines ~289–760), `src/services/areaReadingsService.ts` (`logManualReading` — the existing manual soil-reading write path), `src/components/area/LogReadingModal.tsx`, `supabase/functions/home-overview/index.ts` + `_shared/homeOverview.ts` (sensor/valve summarisation), `src/hooks/usePersona.ts` (`"new" | "experienced" | null`).

## 3. Current state (what we build on)

- `buildWalkList()` (`src/lib/gardenWalk.ts`) pulls 6 parallel queries and the pure `composeAndOrderWalk()` bands plants: critical → overdue → due_today → fresh_hit → stale → everything_else, capped at `maxPerWalk` (30). **It only reads persisted `tasks` rows — ghost tasks are invisible to the walk today.**
- `walkService` persists `garden_walk_sessions` (metrics rolled up at end) + `garden_walk_visits` (one row per plant outcome, `inventory_item_id NOT NULL`, outcome CHECK of 6 values). RLS: home members read, session owner writes.
- Task complete/postpone/skip logic lives inline in `TaskList.tsx` using `buildGhostPayload` (`src/lib/taskMutations.ts`): ghost complete → INSERT Completed row; physical complete → UPDATE; postpone of a blueprint-linked task → mark original Skipped + INSERT new Pending at the new date; standalone postpone → UPDATE `due_date`; plus `logEvent(EVENT.TASK_COMPLETED, …)` and `maybeCreateAutoEntry` journal side-effects.
- Manual area readings already exist: `areaReadingsService.logManualReading()` writes `area_moisture_readings` / `area_temp_readings` / `area_ec_readings` with `source='manual'` and `recorded_at` defaulting to now; DB triggers bump `areas.latest_*`. `LogReadingModal.tsx` is the existing entry UI (Area details → Readings tab).
- `home-overview` edge fn already aggregates, per area: soil-sensor summary (`summariseSoilReading`), valve state (`deriveValveState` from `valve_events` + `automation_valve_queue`), plant counts, tasks-today counts, and a ranked attention row. Pure logic is Deno-tested in `_shared/homeOverview.ts`. It does **not** currently expose location-level or unassigned (home-level) devices, nor >1 sensor per area.
- `usePersona()` returns `"new" | "experienced" | null` (treat null as "new").
- Tier gating: `garden_walk` is available to ALL tiers (`src/constants/tierFeatures.ts`); fresh-hit band is Sage+ only (no `user_insights` otherwise).

## 4. Proposed walk structure

### 4.1 Route = flat ordered array of typed step nodes, grouped into sections

New pure builder **`buildWalkRoute()`** in `src/lib/gardenWalk.ts` (superseding `buildWalkList` as the walk entry point; `composeAndOrderWalk` stays as the plant-ordering helper inside it):

```ts
type WalkStep =
  | { kind: "home";     devices: WalkDevice[]; tasks: WalkTask[]; watchlist: WatchlistItem[]; plans: PlanDigest[] }
  | { kind: "location"; id: string; name: string; devices: WalkDevice[]; tasks: WalkTask[] }
  | { kind: "area";     id: string; name: string; locationId: string; devices: WalkDevice[];
                        tasks: WalkTask[]; plans: PlanDigest[]; latest: AreaLatestReadings | null }
  | { kind: "plant";    plant: WalkPlant; tasks: WalkTask[] };   // WalkPlant = existing shape

interface WalkSection {
  key: string;                       // "home" | `loc-${id}` | `area-${id}` | "unassigned-plants"
  kind: "home" | "location" | "area" | "unassigned_plants";
  refId: string | null;              // location/area uuid, null for home + unassigned
  label: string;
  stepIndexes: [start: number, end: number];   // inclusive range into the flat steps array
}

interface WalkRoute { steps: WalkStep[]; sections: WalkSection[]; }
```

`WalkDevice` = `{ id, name, deviceType: "soil_sensor" | "water_valve", batteryPercent, sensor: SoilSummary | null, valve: ValveState | null }` — shapes returned by the extended `home-overview` (see §7).
`WalkTask` = the app's task shape (real or ghost) + `isGhost`.

### 4.2 Card sequence

```
1. Home step (always first — even if it has nothing actionable it frames the walk;
   collapses to a light "digest" card when empty)
2. For each location (name order):
     Location step                     ← skippable section header card
     For each area in the location (name order):
        Area step                      ← skippable section header card
        Plant steps for that area      ← existing WalkPlantCard, banded WITHIN the area
3. "Unassigned plants" section — plants with area_id IS NULL (banded)
4. WalkSummaryCard (extended metrics)
```

**Ordering decision:** the current global priority-band ordering is replaced by **physical hierarchy order, with bands applied within each area** (and within the unassigned section). Rationale: the ticket's core ask is "walk through the garden" — hopping between beds by priority defeats that. The band chip stays on every plant card, and the Home card gains an "attention preview" line (top 3 critical/overdue plants and which area they're in) so nothing urgent hides at the back. *(Open question 1 confirms this trade-off.)*

**Cap:** `maxPerWalk` now caps **plant steps only**. Section steps always render for any location/area that has ≥1 plant step, task, or device; empty areas are omitted entirely (no card spam for empty beds).

**Progress UI:** header chip becomes "Step N of M" plus the current section label ("Veg Patch"), and a slim section rail (dots or chevron list) showing done/skipped/current sections.

### 4.3 Task assignment to steps — no double counting

Each pending task (real or ghost) appears at **exactly one** step, the most specific:

| Task shape | Step |
|---|---|
| `inventory_item_ids` non-empty | The **plant** step(s) of those items (a multi-plant task shows on the first of its plants in route order only, with "also covers N other plants") |
| `area_id` set | That **area** step |
| `location_id` set (no area) | That **location** step |
| none of the above | **Home** step ("unassigned tasks") |

Included tasks: Pending, `due_date <= today` (overdue + due today), harvest-window tasks in-window, snoozed (`next_check_at > today`) excluded — mirroring `home-overview`'s `isDueToday`/`isOverdue` predicates. **Ghosts included** via `TaskEngine.fetchTasksWithGhosts` (today-scoped) — this is a functional fix over the current walk, which misses every ghost and therefore most recurring watering tasks.

## 5. How each step type works

### 5.1 Home card
- **Devices:** all active `devices` with `area_id IS NULL AND location_id IS NULL` — soil sensors show moisture % + band + temp + reading age (grey >24 h) + battery pip; valves show state (running countdown / next water / failed / idle). Display-only — no valve control in v1 (*open question 2*).
- **Tasks:** unassigned tasks with the three actions (complete / postpone / skip) — see §5.5.
- **Watchlist digest ("look out for"):** active (`is_archived = false`) `ailments` rows for the home — name, type icon, and (new-gardener persona) the first symptoms line. Read-only; tapping does nothing in v1 (walk is focus-mode; no navigation out mid-walk).
- **Plans digest:** `plans` with `status = 'In Progress'` — name + phase-progress line derived from `staging_state` (e.g. "Plants linked · next: assign to beds"). Read-only digest (*open question 3*).
- **Note capture:** every section card gets the Note sheet (see §5.4).
- **Actions:** "Continue" (records `section_done`) / "Skip section" (records `section_skipped`, jumps to next section).

### 5.2 Location card
Same skeleton as Home, scoped: devices with `location_id = X AND area_id IS NULL`; tasks per §4.3; no watchlist/plans panels. Header shows location name + areas/plant counts ("3 areas · 14 plants ahead").

### 5.3 Area card
- Devices with `area_id = X` (all of them — not just the first sensor like the dashboard grid).
- Tasks per §4.3, with actions.
- **Manual soil reading capture:** a "Log reading" button opens a sheet reusing the validation + write path of `areaReadingsService.logManualReading` (moisture % + soil temp °C; EC optional behind a "more" disclosure). `recorded_at` defaults to now — satisfying the ticket's "stamped with current date/time". Triggers keep `areas.latest_*` in sync, the Area details Readings tab and the AI Area Coach pick it up for free. Recording bumps a new `readings_logged` session metric and writes a `reading_logged` visit row.
- **Latest readings strip:** `areas.latest_moisture_pct / latest_temp_c / latest_ec` (+ timestamps) so the card is useful even without hardware — "last logged 3 days ago" is itself a prompt.
- **Plans woven in:** In-Progress plans whose `staging_state.linked_area_id = X` show as a one-line banner ("Part of *Summer Veg Plan* — phase 3 of 5").
- **Area ailment context:** count of active `plant_instance_ailments` among the area's plants ("2 plants flagged in this bed — cards coming up").
- Note capture + Continue / Skip section.

### 5.4 Journal / note capture at section steps
Plant steps keep the existing Snap/Note sheets. Section steps (home/location/area) get the **Note** sheet writing `plant_journals` with `inventory_item_id = NULL` (the Quick Capture precedent) and subject `"Garden Walk — {Home|LocationName|AreaName} · {date time}"`. **Decision:** no new journal columns; the unassigned-journal pattern already exists and the notes surface in Quick Capture's filing flow. Alternative (adding `area_id`/`location_id` to `plant_journals`) rejected as schema creep beyond the ticket. Snap at section level is deferred (*open question 4*).

### 5.5 Task actions — reuse existing mutation semantics, extracted
`TaskList.tsx`'s handlers are component-locked, so extract the minimal mutation core into **`src/lib/taskActions.ts`** (new, pure service functions; `TaskList` itself is **not** refactored in this ticket — no speculative changes):

- `completeTask(task, userId)` — ghost → `INSERT tasks` via `buildGhostPayload(task, "Completed", { completed_at, completed_by })`; physical → `UPDATE`. Fires `logEvent(EVENT.TASK_COMPLETED, …)` and `maybeCreateAutoEntry` exactly like TaskList (AI-journal parity).
- `skipTask(task)` — ghost → insert `Skipped` payload; physical → `UPDATE status='Skipped'`.
- `postponeTask(task, newDate)` — ghost → insert `Skipped` + insert `Pending` at `newDate`; physical blueprint-linked → mark `Skipped` + insert new `Pending`; standalone → `UPDATE due_date`. Postpone UI in the walk = three quick chips (Tomorrow / +3 days / Pick a date → native date input) in a small sheet.

Completing a task from the walk records a `task_completed` visit row (plant steps reuse the plant-scoped row; section steps use the section-scoped row shape from §6) and bumps `tasksCompleted` in the session summary. Harvest-window tasks completed from the walk keep it simple in v1: plain complete (no ripeness/partial-pick sheets — those stay in Task Detail; the card links "more options" copy pointing users there, *open question 5*).

## 6. Skip-section + resume semantics (session persistence)

**Principle: progress is derived from visit rows, never from a serialized route snapshot.** The route is rebuilt deterministically at bootstrap; anything already actioned today drops out. This keeps resume free of stale-snapshot bugs (plants added mid-day just appear).

Migration (see §8) generalises `garden_walk_visits` into a step-visit log:

- `inventory_item_id` becomes **nullable**; new nullable `section_kind text` + `section_ref_id uuid`; CHECK that exactly one of (`inventory_item_id`, `section_kind`) identifies the row.
- `outcome` CHECK widened with `section_done`, `section_skipped`, `reading_logged`.

Semantics:

- **Skip section** → `section_skipped` row; route builder still *includes* skipped sections on the next bootstrap the same day (skipped ≠ done — the ticket's "return later"), but the summary + "Walk what's left" flag them as "skipped earlier".
- **Section done / plant visited (any non-skip outcome)** → excluded from same-day rebuilds (existing behaviour, extended to sections).
- **Resume:** on `/walk` mount, look for today's open session (`ended_at IS NULL`, `started_at >= local midnight`, same user). If found, offer **Resume** (reuses the session id — no orphan row) vs **Start fresh** (closes the old session, starts new). This replaces the current always-new-session bootstrap; the superseded-generation guard stays.
- Session metric columns gain `sections_visited int` + `readings_logged int` (summary card shows them).

## 7. Sensors/valves data source — extend `home-overview` (decision)

**Decision: add a `view: "walk"` request parameter to the existing `home-overview` edge function** rather than (a) duplicating `summariseSoilReading`/`deriveValveState` client-side or (b) a new walk-specific function.

- `view: "walk"` returns everything the current response has **plus** a flat `devices[]` array — one entry per active device with `{ id, name, deviceType, areaId, locationId, batteryPercent, sensor, valve }` — covering **unassigned and location-level devices** and **multiple sensors per area** (the grid view only surfaces the first per area).
- Rationale: the valve-state derivation (running-countdown vs failed-queue vs next-water) and soil summarisation are non-trivial, Deno-tested in `_shared/homeOverview.ts`, and already load-bearing on the dashboard. Duplicating them in `src/lib` guarantees drift; a second edge function duplicates all the fetch plumbing. The marginal cost of the view param is one extra shaping branch.
- The walk bootstrap calls `home-overview` (walk view) **in parallel** with the existing client queries; if the call fails, the walk degrades gracefully to no-device cards (devices are enrichment, not the skeleton).

Client reads added to the bootstrap (all RLS-scoped, parallel): `locations (id, name, areas(id, name))`, `plans (In Progress)`, `ailments (active watchlist)`, `areas.latest_*` (via the areas select), tasks via `TaskEngine.fetchTasksWithGhosts` (today-bounded) instead of the current raw pending-tasks query.

## 8. DB changes (one migration)

`supabase/migrations/<ts>_garden_walk_hierarchy.sql` — idempotent, apply locally first (`supabase migration up`), push only on explicit confirmation:

```sql
ALTER TABLE public.garden_walk_visits
  ALTER COLUMN inventory_item_id DROP NOT NULL;
ALTER TABLE public.garden_walk_visits
  ADD COLUMN IF NOT EXISTS section_kind text
    CHECK (section_kind IN ('home','location','area','unassigned_plants')),
  ADD COLUMN IF NOT EXISTS section_ref_id uuid;   -- location/area id; NULL for home/unassigned

-- exactly one identity per visit row
ALTER TABLE public.garden_walk_visits
  ADD CONSTRAINT garden_walk_visits_identity_chk
  CHECK ( (inventory_item_id IS NOT NULL AND section_kind IS NULL)
       OR (inventory_item_id IS NULL     AND section_kind IS NOT NULL) );

-- widen outcome CHECK (drop + re-add):
--   + 'section_done', 'section_skipped', 'reading_logged'

ALTER TABLE public.garden_walk_sessions
  ADD COLUMN IF NOT EXISTS sections_visited int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readings_logged  int NOT NULL DEFAULT 0;
```

No new tables → no new Data-API grants needed (existing tables are grandfathered; RLS policies unchanged — the existing session-owner INSERT policy already covers section rows since it keys off `session_id`). Manual readings reuse the existing `area_*_readings` tables — **no new `manual_readings` table** (rejected: a parallel store would bypass the `areas.latest_*` triggers, the Readings tab, drydown profiles, and the AI Area Coach's `based_on_reading_at` regeneration).

## 9. File-by-file change list

| File | Change |
|---|---|
| `src/lib/gardenWalk.ts` | Add `WalkStep`/`WalkSection`/`WalkRoute` types + pure `composeWalkRoute()` (unit-tested) + `buildWalkRoute()` fetch orchestration (locations, ghosts via taskEngine, plans, watchlist, home-overview walk view, existing plant signals). Keep `composeAndOrderWalk` for within-area plant ordering. |
| `src/lib/taskActions.ts` | **New** — `completeTask` / `skipTask` / `postponeTask` extracted per §5.5 (semantics mirrored from `TaskList.tsx`; TaskList untouched). |
| `src/services/walkService.ts` | `recordVisit` gains section-shaped overload; `startOrResumeSession(homeId, userId, today)`; `endSession` writes the two new metrics. |
| `src/components/walk/GardenWalk.tsx` | Reducer drives `route.steps` index instead of plant list; resume prompt state; section skip jumps `currentIndex` past the section's range; summary metric plumbing. |
| `src/components/walk/WalkSectionCard.tsx` | **New** — shared card for home/location/area steps (device chips, task list w/ actions, watchlist/plans panels, note sheet, log-reading button on area kind, Continue/Skip section). `data-testid` on every action (`walk-section-continue`, `walk-section-skip`, `walk-task-complete-{id}`, `walk-log-reading`, …). |
| `src/components/walk/WalkTaskRow.tsx` | **New** — one task row + complete/postpone/skip controls + postpone sheet; reused by section and plant cards. |
| `src/components/walk/WalkPlantCard.tsx` | Add the task list (via `WalkTaskRow`) under the context chips; persona-aware copy density; keep Snap/Note/All good/Skip. |
| `src/components/walk/WalkReadingSheet.tsx` | **New** — thin walk-styled sheet over `areaReadingsService.logManualReading` (adapting `LogReadingModal`'s field logic; the modal itself stays where it is). |
| `src/components/walk/WalkSummaryCard.tsx` | Add sections visited / skipped-earlier list / readings logged; "Walk what's left" surfaces skipped sections first. |
| `supabase/functions/home-overview/index.ts` | `view: "walk"` branch → flat `devices[]` payload incl. unassigned/location-level devices. |
| `supabase/functions/_shared/homeOverview.ts` | `shapeWalkDevices()` pure helper (Deno-tested). |
| `supabase/migrations/<ts>_garden_walk_hierarchy.sql` | §8. |
| `src/hooks/usePersona.ts` | No change — consumed by the walk components (null → "new"). |

## 10. Phasing (each phase independently shippable)

**Phase 1 — Hierarchical skeleton + tasks (the core of the ticket).**
Migration; `composeWalkRoute`/`buildWalkRoute`; `WalkSectionCard` (tasks + notes, **no** device/plans/watchlist panels yet); `WalkTaskRow` + `taskActions.ts` (task actions on section *and* plant cards, ghosts included); skip-section + resume; summary + "Walk what's left" updates. Ships as a complete, better walk.

**Phase 2 — Telemetry + manual readings.**
`home-overview` walk view + `shapeWalkDevices`; device chips on home/location/area cards; `WalkReadingSheet` + `reading_logged` visits + `readings_logged` metric; `areas.latest_*` strip on area cards.

**Phase 3 — Plans, watchlist, persona polish.**
Watchlist digest (home) + area ailment context; plans digests (home + area banners); persona-differentiated copy/density pass across all cards; summary celebration polish.

## 11. Persona differences (`usePersona`, null ⇒ "new")

| Surface | New gardener | Experienced |
|---|---|---|
| Section cards | Guidance sentence per panel ("Moisture below 30% means this bed is thirsty — most veg like 40–60%") | Compact chips, raw values, no prose |
| Watchlist digest | Symptom summary per item ("look for sticky residue under leaves") | Names + type icons only |
| Task rows | Description shown expanded | Title-only, description behind a tap |
| Reading sheet | Field helper text + typical ranges | Bare inputs |
| Summary | Encouraging framing + "what tomorrow's walk will hold" | Stats-first |

Same data everywhere; persona changes copy + density only. Persona rendering decisions live in the components (no persona logic in `gardenWalk.ts`).

## 12. Risks / edge cases

- **Task double-counting** — the §4.3 most-specific-step rule is enforced in the pure composer and unit-tested (multi-plant tasks, area+plant tasks, ghosts).
- **Ghost materialisation races** — completing the same ghost twice (walk + another tab) hits `unique_blueprint_date`; `taskActions` treats a unique-violation on insert as already-materialised and retries as an UPDATE.
- **Homes with no locations/areas** — route collapses to Home step → unassigned plants; must not render empty section shells.
- **Resume across midnight** — an open session from yesterday is *not* resumable (close it silently, start fresh); "today" is local-time, consistent with `todayLocal()`.
- **`home-overview` failure mid-bootstrap** — degrade to deviceless cards, never block the walk (devices are enrichment).
- **StrictMode double-bootstrap** — the generation guard must also cover the resume path (don't close a *resumed* session as an orphan).
- **Big homes** — plant cap unchanged (30); a home with 12 areas adds ~14 section cards — acceptable, but the section rail must make skipping cheap. Route build adds ~4 queries + 1 edge call to the existing 7 — still one bootstrap round-trip wave.
- **RLS** — all new reads are existing home-member-read tables; section visit INSERTs ride the existing session-owner policy. `valve_events` are only read server-side (service role in home-overview behind the membership check), so no client RLS gap.
- **Postpone from walk** — reuses TaskList semantics exactly; divergence here would create two postpone behaviours (the extraction in §5.5 is the mitigation, with unit tests asserting parity).
- **Offline mid-walk** — unchanged from today: advances on local state, visit rows fire-and-forget; manual readings + task mutations are awaited and show a toast + stay-on-card on failure.

## 13. Tests (per tier)

**Vitest (`tests/unit/lib/`):**
- `gardenWalk.test.ts` — extend: `composeWalkRoute` (section ordering, empty-area omission, task most-specific assignment incl. ghosts + multi-plant, cap-applies-to-plants-only, same-day done vs skipped section filtering, resume filtering, unassigned plants section).
- `taskActions.test.ts` — **new**: ghost vs physical complete/skip/postpone payloads, blueprint vs standalone postpone, unique-violation fallback (supabase mocked as in existing unit tests).

**Deno (`supabase/tests/`):**
- `homeOverview.test.ts` — extend: `shapeWalkDevices` (unassigned/location/area buckets, multi-sensor areas, valve states, stale-reading greying).

**Playwright (`tests/e2e/specs/` + `tests/e2e/pages/`):**
- Extend the garden-walk spec + Page Object: hierarchical order (home → location → area → plants), section skip jumps + reappears on resume, resume prompt after leaving mid-walk, task complete from an area card creates/updates the row, manual reading logged with now-stamp appears in Area Readings, note from a section card lands in `plant_journals` unassigned, summary shows new metrics. Reference RHO-17 in test names. Seeds: add a home-level + location-level device and an unassigned task to `supabase/seeds/` (likely `01_locations_areas.sql` / `03_tasks_blueprints.sql` + a devices seed) so worker accounts exercise every step kind.

## 14. Docs to update (same tasks as the code lands)

- `docs/app-reference/02-dashboard/13-garden-walk.md` — substantial rewrite (both roles: new component graph, route model, section semantics, resume, readings, persona table).
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — `home-overview` `view=walk` param.
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — add walk to the consumed-by section.
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — note `src/lib/taskActions.ts` as a mutation path.
- `docs/app-reference/07-management/07-integrations-readings.md` — note the walk as a second manual-reading entry point.
- `docs/e2e-test-plan/29-garden-walk.md` — new test rows per §13; `docs/e2e-test-plan/01-seeded-fixtures.md` if seed UUIDs are added; `TESTING.md` inventory counts.

## 15. Open questions for the human (please answer on the ticket)

1. **Ordering trade-off** — OK to replace global priority-band ordering with physical hierarchy order (bands within each area) + an attention preview on the Home card? Alternative: an optional "priority first" toggle in walk settings (deferred unless you want it now).
2. **Valve control** — the ticket says *show* values + states. Confirm valves are **display-only** in the walk (no open/close button). Adding control means queue writes + safety confirmations — happy to scope as a follow-up ticket.
3. **Plans depth** — is a read-only digest (name + phase + next action text) enough, or should plan phase actions (e.g. "mark plants assigned") be actionable inside the walk? Plan-staging mutations are heavy; recommend read-only for v1.
4. **Section-level photos** — Note capture is planned at every step; do you also want **Snap** (photo) on home/location/area cards? Cheap to add (same unassigned-journal write) — say the word.
5. **Harvest tasks in-walk** — plain complete only, with ripeness/partial-pick sheets staying in Task Detail? Or should `HarvestRipenessSheet` be reachable from the walk (adds an AI call surface to the walk)?
6. **Unassigned tasks scope** — should the Home step include *personal-scope* tasks (`scope='personal'`, `user_id = walker`) as well as home-scope unassigned ones? Recommend yes (both), clearly labelled.
7. **Walk length guardrail** — keep `maxPerWalk = 30` plant cap? A "full day's gardening" walk in a big garden may want a higher/no cap once sections make skipping easy.
