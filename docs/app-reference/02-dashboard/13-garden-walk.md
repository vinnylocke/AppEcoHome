# Garden Walk

> A guided full-screen walk through the whole garden. Since RHO-17 (v2, Phase 1) the walk is **hierarchical**: it opens on a Home card (unassigned + personal tasks, attention preview), then moves Location → Area → the area's plant cards, finishing with plants not assigned to any area. Every card carries its tasks with complete / postpone / skip actions (ghost tasks included), plus note and photo capture. Phase 2 adds **telemetry** (soil-sensor chips and water-valve rows on section cards, fed by `home-overview view:"walk"`), **manual valve open/close with a duration timer** (approved answer 2 — the existing integrations control path), and **manual soil readings** from area cards (stamped now, written through the existing `area_*_readings` path). Phase 3 weaves in the **watchlist** (a "look out for" digest on the Home card, per-bed ailment context on area cards), **actionable In-Progress plans** (home digest + area banners with in-walk phase-5 activation, approved answer 3), the **full harvest experience on walk task rows** (AI ripeness check, partial-pick yield logging, window-capped snoozing — the exact Task Detail sheets, approved answer 5), and the **§11 persona pass** (guidance prose for new gardeners, compact chips for experienced — copy + density only). Sections can be skipped and picked up later the same day; an abandoned walk offers Resume.

**Route:** `/walk` (focus-mode shell on **every viewport** — no top bar, no side nav — since RHO-18. Previously `isMobile`-gated, which left the sticky app header overlapping the walk's own header on a landscape tablet. `App.tsx` now derives `isFocusMode` from `isWalk || (isMobile && /quick)`. The focus-mode floating **profile** dropdown is suppressed on `/walk` (the card's own Stop button owns the top-right corner); the floating burger stays, and the walk headers carry `pl-14` to clear it. The Plant Doctor chat FAB is also suppressed.)
**Source files (entry points):**
- `src/components/walk/GardenWalk.tsx` — page shell + state machine (loading / resume-prompt / empty / error / walking / finished)
- `src/components/walk/WalkSectionCard.tsx` — shared home / location / area card (tasks, sensor chips, valve rows, latest-readings strip, note + photo sheets, Continue / Skip section)
- `src/components/walk/WalkValveRow.tsx` — one water-valve row: state + open-with-duration / close (Phase 2)
- `src/components/walk/WalkReadingSheet.tsx` — manual soil-reading capture from an area card (Phase 2; persona helper copy in Phase 3)
- `src/components/walk/WalkWatchlistPanel.tsx` — watchlist digest (home) / per-bed ailment context (area) — Phase 3
- `src/components/walk/WalkPlanBanner.tsx` — In-Progress plan digest (home) / actionable banner with phase-5 activation (area) — Phase 3
- `src/components/walk/WalkPlantCard.tsx` — one full-bleed card **per (plant × area) group** + sticky action bar + its task rows. Same-plant, same-area instances collapse into one card (RHO-18): the card shows a "N plants" count chip + a collapsible per-instance list, and Snap/Note offer a "which plant(s)?" multi-select (`InstancePicker`, defaults to all) so a photo/note files against the chosen instance(s)
- `src/components/walk/WalkTaskRow.tsx` — one task row (complete / postpone / skip, plus the full in-window harvest strip) shared by section and plant cards
- `src/components/walk/WalkSummaryCard.tsx` — end-of-walk celebration (+ sections visited, readings logged, skipped-earlier list; persona framing)
- Launched from the dashboard's `dash-garden-walk` button (`src/components/home/HomeMain.tsx`, both densities, when `totalPlants >= 5`) — the old `WalkStartTile` on the retired `/quick` home is gone
- `src/lib/gardenWalk.ts` — plant signals (`composeAndOrderWalk`) + hierarchical route composer (`composeWalkRoute`, pure + unit-tested) + fetch orchestration (`buildWalkRoute`); exports `MAX_PLANTS_PER_WALK`, `derivePlanPhase`
- `src/lib/taskActions.ts` — shared task mutation core (complete / skip / postpone / `snoozeHarvestTask`) used by the walk AND TaskList
- `src/services/walkService.ts` — session + visit writes, resume lookup, section visits

---

## Quick Summary

The user taps **Start a Garden Walk** (dashboard launcher or Quick Access tile) and lands on the **Home card**: its unassigned home-scope tasks, their own personal-scope tasks, a "needs your eyes today" preview of the top critical/overdue plants, a **"look out for" watchlist digest** (every active ailment with its type and how many plants are flagged) and a digest of every **In-Progress plan** with its phase. Continue descends into the first location card, then each of its area cards, then the area's plant cards — the physical order a gardener actually walks, with urgency bands applied *within* each area. Plants with no area form a trailing section. Section cards show that step's **devices**: soil-sensor chips (moisture band + temp + battery, greyed when stale) and water-valve rows with **Open for 5/10/15 min or a custom duration** and **Close now** — the same manual control path as the Integrations device modal, dead-man's-switch included. Area cards carry the bed's latest logged soil readings and a **Log reading** sheet (moisture % + soil temp °C + **soil EC µS/cm**, stamped now — EC posts as calibrated; the raw-ADC discriminator + backdating stay in the Area details LogReadingModal), plus a collapsed **Bed profile** section on the same sheet (2026-07-18) exposing the area's Advanced-settings quartet — **medium pH, peak light lux, water movement, nutrient source** — prefilled from `areas` on open (fields render only after the prefill lands so a slow fetch can't clobber typing), diff-saved so only *changed* fields update (`src/lib/walkBedProfile.ts`), with a new peak-light value also logging a manual `area_lux_readings` row (mirrors `AreaLuxReadings`, keeps Light Sensor history coherent). Select options are shared with Advanced settings via `src/constants/areaProfileOptions.ts` so stored values can't drift. These fields ground the AI Area Coach + Garden AI chat. Plus **"Flagged in this bed"** ailment context and a **plan banner** when a plan is staged into that bed (its tasks complete in-walk; phase 5 "Activate maintenance" fires right from the banner; "Open plan" deep-links out). Any card can complete, postpone (Tomorrow / +3 days / pick a date) or skip its tasks; **harvest-window tasks open the full harvest strip** (Harvested / Picked some / Not yet / Check with AI — the same sheets as Task Detail); every card can capture a note or a photo. Copy density follows the user's **persona** (new gardeners get guidance prose; experienced get compact chips). Skip-section jumps a whole location or area and flags it "skipped earlier" — it reappears on "Walk what's left" or on a resumed session the same day; sections marked done don't. The summary card rolls up plants visited, sections visited, readings logged, photos, notes, tasks completed and ailments flagged.

**Multiple walks per day (2026-07-18).** The same-day progress filter is now scoped by *intent*, fixing the "Resume/Start fresh both land on the empty screen after a completed walk" loop:

| Action | Progress filter |
|---|---|
| **Resume** (resume prompt) | Day-scoped — continues where the open session left off. |
| **Walk what's left** (summary) | Day-scoped — skipped sections reappear, done ones don't. |
| **Start fresh** (resume prompt) | **None** — `bootstrap({ ignoreTodayProgress })` → `buildWalkRoute(..., { ignoreTodayProgress: true })` builds the full route (visit metadata like last-visited/all-good banding is kept; only the exclusion is bypassed). |
| **Start a full walk** (summary) / **Walk everything again** (empty screen) | None — same fresh mode. |

`WalkRoute.filteredByProgress` (set by day-scoped builds when today's walking excluded plants or `section_done` sections) drives the empty screen: when true it says "You've walked everything today" and offers **Walk everything again**; a genuinely walkless home keeps the add-plants copy with no loop-to-empty button. The bootstrap also **closes the session whenever a route composes to zero steps** — previously an empty route left its just-created session open forever, which is what produced the phantom "Resume or start fresh?" prompt after a completed walk.

---

## Role 1 — Technical Reference

### Component graph

```
GardenWalk  (mounted at /walk)
├── bootstrap: walkService.findOpenSession → (resume prompt | close stale | fresh)
│              then startSession (or reuse id) ∥ buildWalkRoute
├── reducer state: loading | resume-prompt | empty | error | walking | finished
├── walking — route.steps[currentIndex] switches the card:
│   ├── WalkSectionCard   (kind home | location | area; keyed by section key)
│   │   ├── Header (Step N of M + section label + Stop — walk-card-stop)
│   │   ├── Attention preview (home kind only)
│   │   ├── WalkWatchlistPanel (Phase 3 — home: "Look out for" digest;
│   │   │   area: "Flagged in this bed"; tap → navigate("/watchlist"))
│   │   ├── WalkPlanBanner[] (Phase 3 — home: In-Progress digest;
│   │   │   area: actionable banner — Activate maintenance (phase 5) /
│   │   │   Open plan → navigate("/planner"))
│   │   ├── Devices panel (Phase 2 — step.devices from home-overview walk view)
│   │   │   ├── WalkSensorRow[]  (moisture band chip + temp + battery, stale greying)
│   │   │   └── WalkValveRow[]   (state + Open 5/10/15/custom min + Close now)
│   │   ├── Soil-readings strip (area kind only — areas.latest_soil_*)
│   │   │   └── Log reading → WalkReadingSheet
│   │   │       ├── readings (moisture/temp/EC) → areaReadingsService.logManualReading
│   │   │       └── Bed profile (pH/lux/water/nutrient) → areas.update diff
│   │   │           (+ area_lux_readings insert on a new peak-light value)
│   │   ├── WalkTaskRow[]  → taskActions complete/postpone/skip
│   │   ├── Note sheet / Snap sheet → plant_journals (inventory_item_id NULL)
│   │   └── Continue (section_done) / Skip section (section_skipped, jump range)
│   └── WalkPlantCard     (kind plant; keyed by inventoryItemId)
│       ├── Header (Step N of M + enclosing section label + Stop)
│       ├── Hero, band chip, context chips
│       ├── WalkTaskRow[]  ("Tasks for this plant", incl. ghosts)
│       │   └── in-window harvest strip (Phase 3) →
│       │       HarvestRipenessSheet / HarvestPartialPickSheet /
│       │       HarvestEndOfLifePrompt (the Task Detail components, portalled)
│       ├── Snap / Note sheets (plant-scoped journal rows)
│       └── All good / Skip / Stop
└── finished
    └── WalkSummaryCard (sections visited, readings logged, photos, notes,
        tasks, ailments, skipped-earlier list, Walk what's left,
        Done → navigate(returnTo); persona framing)
```

### Route model (`src/lib/gardenWalk.ts`)

- `composeWalkRoute()` (pure) → `WalkRoute { steps: WalkStep[]; sections: WalkSection[] }`.
- Step kinds: `home` | `location` | `area` | `plant`. Sections: `home`, `loc-{id}`, `area-{id}`, `unassigned-plants`, each an inclusive `[stepStart, stepEnd]` range — a **location section spans its areas' ranges**, so skip-section from a location card jumps everything inside it. `sectionForStep()` returns the smallest enclosing section (used for the header label).
- Ordering: Home first → locations (name order) → areas (name order) → plants **banded within the area** (critical → overdue → due_today → fresh_hit → stale → everything_else — `composeAndOrderWalk` still owns banding). Unassigned plants trail, no header card. Empty locations/areas (no plant steps AND no tasks) are omitted.
- **Instance grouping (RHO-18):** `composeAndOrderWalk` collapses same-plant, same-area instances into ONE `WalkPlant` carrying `instanceCount` + `instances: WalkPlantInstance[]`. Group key = `(plant_id ?? normalised plant_name) | area_id`. The card's `band` = the most urgent member's band (a sick plant is never buried); ailment/overdue/due-today/insight counts are summed. The representative (`inventoryItemId`) is the first member in band-then-name order. The **cap counts groups, not raw instances** — a bed of 20 tomatoes is one card. `composeWalkRoute` indexes **every** member instance id into `plantRoutePosition` and maps it to the group's representative, so a task keyed to any member resolves to the one group step (`alsoCoversCount` counts only instances *outside* the group).
- **Task → step assignment (exactly one step, most specific wins):** personal-scope → Home (labelled); `inventory_item_ids` → first of its plants in route order (`alsoCoversCount` notes the rest; falls back area → location → home when none of its plants are on today's route); `area_id` → area; `location_id` → location; none → Home. Included tasks: `Pending`, `due_date <= today` (harvest-window tasks are open from `due_date`), not snoozed (`next_check_at > today` excluded) — `isWalkableTask()`.
- **Ghost tasks are included** via `TaskEngine.fetchTasksWithGhosts` (today-scoped, `includeOverdue`) — a functional fix over v1, which only read persisted rows and missed most recurring watering tasks. `TaskEngine.invalidateCache(homeId)` runs first so a same-day rebuild never sees the pre-walk snapshot.
- **Cap:** `MAX_PLANTS_PER_WALK` (30) is the single exported, documented knob — it caps **plant steps only** (bands-first sort keeps the most urgent plants under the cap); section cards always render for non-empty sections.
- **Device → step assignment (Phase 2, most specific wins):** `areaId` (known area) → area step; else `locationId` (known location) → location step; else Home step. ALL of an area's devices attach (the dashboard grid only shows the first sensor per area). A device alone keeps its section alive — an empty bed with a sensor still gets its card. Area steps also carry `latest: AreaLatestReadings | null` from `areas.latest_soil_*`.
- **Watchlist weaving (Phase 3):** the Home step carries `watchlist: WalkWatchlistItem[]` — every active (`is_archived = false`) `ailments` row with `type`, the first `symptoms` entry, and a home-wide count of active `plant_instance_ailments` links. Area steps carry the subset with active links among *that area's* plants — bucketed via a full `inventory_items (id, area_id)` map so plants already visited today still contribute their area context. Sorted by link count then name.
- **Plan weaving (Phase 3, approved answer 3):** `derivePlanPhase()` (pure, unit-tested) mirrors PlanStaging's phase derivation exactly — 1 `linked_area_id`, 2 `plants_linked`, 3 `plants_assigned`, 4 `status ∈ {In Progress, Completed}`, 5 `maintenance_active`; plant-first plans are phase-less. The Home step digests every In-Progress plan; an area step gets the digests whose `staging_state.linked_area_id` is that area, each with `openTaskCount` (the plan's walkable tasks on today's route) and `canActivateMaintenance` (phase 5 current). **Watchlist/plan context is enrichment — it never forces an empty section to render** (the ≥1 plant/task/device rule stands).

### Resume + skip-section semantics

Progress is **derived from `garden_walk_visits` rows, never a serialized route snapshot**:

- `section_done` today → that section's header step is omitted from a same-day rebuild (its plant steps stay individually governed by plant visits).
- `section_skipped` today → the section **reappears** with `skippedEarlier: true` (chip on the card, listed on the summary).
- `task_completed` section rows are history/metrics only — they do NOT exclude a section.
- On `/walk` mount, `walkService.findOpenSession` looks for the user's latest un-ended session: started today → **Resume prompt** (Resume reuses the session id — no orphan row; Start fresh closes it and opens a new one); started before today → closed silently, fresh walk. Section-visit reads are scoped to the *walking user's* sessions (another member's walk can't mark your sections done).
- The StrictMode superseded-bootstrap guard only closes sessions the losing bootstrap itself opened — a resumed session is never closed as an orphan.
- **Phase 3 navigation-out:** tapping a watchlist item (`/watchlist`) or a plan's "Open plan" (`/planner`) deliberately leaves the walk with the session open — the standard abandon path, so the next `/walk` launch offers Resume with everything covered so far intact.

### Data flow — read paths

`buildWalkRoute(homeId, userId, settings)` runs in one parallel wave:

| Query | Use |
|---|---|
| `buildWalkList` (6 parallel queries + plants lookup — unchanged from v1) | Banded, capped `WalkPlant[]` (now carrying `areaId` / `locationId`) |
| `locations (id, name, areas(id, name, location_id, latest_soil_*))` | Route skeleton + the area cards' latest-readings strip |
| `TaskEngine.fetchTasksWithGhosts` (today, includeOverdue) | Real + ghost tasks for every step |
| `garden_walk_sessions (id)` today, own user → `garden_walk_visits` section rows for those sessions | Same-day done/skipped section filtering |
| `home-overview` edge fn with `view: "walk"` (Phase 2) | Flat `devices[]` — every active device with sensor summary (`summariseSoilReading`) / valve state (`deriveValveState`) + valve-control metadata (provider / controllable / default duration). **Soft-fail**: on error the walk renders deviceless cards — telemetry never blocks the walk |
| `ailments (id, name, type, symptoms)` active only (Phase 3) | Home "look out for" digest + area context. **Soft-fail** to empty |
| `plant_instance_ailments (ailment_id, plant_instance_id)` active (Phase 3) | Link counts, home-wide + per area. **Soft-fail** |
| `inventory_items (id, area_id)` non-archived (Phase 3) | Buckets ailment links per area (covers already-visited plants). **Soft-fail** |
| `plans (id, name, status, kind, staging_state)` In Progress (Phase 3) | Plan digests + area banners via `derivePlanPhase`. **Soft-fail** |

### Data flow — write paths

| Trigger | Call |
|---|---|
| Mount (fresh) | `INSERT garden_walk_sessions` |
| Resume | no insert — the open session id is reused |
| Plant outcomes | `INSERT garden_walk_visits (inventory_item_id, outcome)` — **one row per member instance** of a grouped card (RHO-18), so a same-day walk rebuild filters the whole group out (`visitedTodaySet` is keyed per instance). Snap/Note capture writes are per **selected** instance (`InstancePicker`); other outcomes write for all members |
| Section Continue / Skip | `INSERT garden_walk_visits (section_kind, section_ref_id, outcome='section_done'/'section_skipped')` — fire-and-forget |
| Task complete (any card) | `src/lib/taskActions.completeTask` (ghost materialisation with `unique_blueprint_date` 23505 → UPDATE fallback; `logEvent(task_completed)`; `maybeCreateAutoEntry`) + a `task_completed` visit row (plant- or section-shaped) + `tasksCompleted` bump. The card does NOT advance — the user resolves it explicitly |
| Task postpone / skip (any card) | `taskActions.postponeTask` / `skipTask` — identical semantics to TaskList (TaskList now calls the same functions) |
| Section note / photo | `INSERT plant_journals (inventory_item_id NULL, subject "Garden Walk — {Home\|Location\|Area} · {date time}", description / image_url)` — the Quick Capture unassigned-journal precedent; photos upload to `plant-images/walks/{homeId}/sections`. No visit row; no advance |
| Valve Open / Close (Phase 2) | `supabase.functions.invoke("integrations-ewelink-control" \| "integrations-adapter-control", { deviceId, command: "turn_on"\|"turn_off", durationSeconds })` — **exactly the ValveControlPanel path**. The edge fn records the command in `device_commands` with `auto_off_at` (dead-man's-switch) and, for eWeLink, passes the countdown so the device self-enforces it; the response's `autoOffAt` drives the row's local countdown. Failures toast with the extracted edge error; state reverts |
| Manual soil reading (Phase 2) | `areaReadingsService.logManualReading({ homeId, areaId, moisturePct?, tempC? })` — `recordedAt` omitted so the reading is **stamped now**; writes `area_moisture_readings` / `area_temp_readings` with `source='manual'`; DB triggers bump `areas.latest_soil_*`. Then a `reading_logged` section visit row + `readingsLogged` bump. No advance |
| Harvest "Harvested" / AI verdict "ripe" (Phase 3) | `taskActions.completeTask` (same as any complete) then, for `Harvesting` tasks with linked instances, `HarvestEndOfLifePrompt` — the same post-complete prompt TaskList queues (optional `inventory_items.ended_at` + closing `plant_journals` rows) |
| Harvest "Picked some" (Phase 3) | `HarvestPartialPickSheet` (the Task Detail component) → `yieldService.insertYieldRecord` — the entered amount is the **task total**, split evenly across the linked instances via `splitYieldEvenly` (`src/lib/yieldSplit.ts`): one `yield_records` row per instance carrying `total/N` (remainder on the last row) so the parts sum exactly to the total, not `total × N` (RHO-21) — then `taskActions.snoozeHarvestTask(task, days)` |
| Harvest "Not yet" / AI "near/not ripe" (Phase 3) | `taskActions.snoozeHarvestTask` — ghost → materialise Pending first, then `UPDATE tasks SET next_check_at = today + days`, **capped at `window_end_date`** (TaskModal `snoozeFor` parity). Row resolves to *Snoozed* |
| Plan "Activate maintenance" (Phase 3) | Mirrors `PlanStaging.handleActivateMaintenance` write-for-write: `planStagingService.activateMaintenanceBlueprints` (blueprint inserts + `plans.status='Completed'`) → `staging_state.maintenance_active = true` merge → `logEvent(PLAN_COMPLETED)` → `saveMemoryEvent("completed_plan")`. The blueprint jsonb is fetched lazily on tap (overhaul plans normalised via `normaliseOverhaulBlueprint`) |
| End-of-walk | `UPDATE garden_walk_sessions` with metrics incl. `sections_visited` + `readings_logged` |

### DB (migration `20260830000000_garden_walk_hierarchy.sql`)

`garden_walk_visits.inventory_item_id` now nullable; `section_kind` (`home|location|area|unassigned_plants`) + `section_ref_id`; identity CHECK (exactly one of plant / section); `outcome` CHECK widened with `section_done`, `section_skipped`, `reading_logged`; partial index on section rows. `garden_walk_sessions` gains `sections_visited` + `readings_logged`. RLS unchanged (section rows ride the session-owner INSERT policy).

### Edge functions invoked

| Function | When | Notes |
|---|---|---|
| `home-overview` (`view: "walk"`) | Bootstrap, in parallel with the client reads | Returns the default payload plus flat `devices[]`. Soft-fail — a failed call renders deviceless cards, never an error state |
| `integrations-ewelink-control` | Valve Open / Close on an eWeLink valve | Same function ValveControlPanel uses; records `device_commands` with `auto_off_at`; device self-enforces the countdown |
| `integrations-adapter-control` | Valve Open / Close on a controllable `custom_http` valve | Generic dispatcher — same request shape (`deviceId`, `command`, `durationSeconds`) |
| `plant-doctor` (`analyse_comprehensive`) | Harvest "Check with AI" (Phase 3) | Via `PlantDoctorService.analyseComprehensive` inside `HarvestRipenessSheet` — the same AI call Task Detail makes; verdict completes (ripe) or snoozes by the estimate |

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|---|---|
| `pattern-scan` / `pattern-evaluate` | The fresh-hit band uses `user_insights` rows surfaced by these crons. |
| `generate-tasks` | Materialised blueprint tasks appear as physical rows; un-materialised occurrences appear as ghosts either way. |

### Realtime channels

None. The route is composed once per bootstrap and never re-fetches mid-walk.

### Tier gating

| Tier | Differences |
|---|---|
| Sprout / Botanist | Full hierarchical walk incl. task actions. No fresh-hit band (no `user_insights`). |
| Sage / Evergreen | Adds the fresh-hit band + Sparkles chip. |

### Beta gating

None.

### Persona rendering (§11 — Phase 3)

`usePersona()` (`null` ⇒ treated as **"new"**) is consumed *inside the components* — no persona logic in `gardenWalk.ts`. Same data for both personas; only copy + density differ:

| Surface | New gardener | Experienced |
|---|---|---|
| Section cards | Guidance prose under the devices panel (`walk-guidance-devices`) and readings strip (`walk-guidance-readings`) | No prose |
| Watchlist panel | First-symptom hint per item (`walk-watchlist-symptom-*`) + closing guidance (`walk-watchlist-guidance`) | Names + type icons + counts only |
| Plan banner (area) | Extra "the plan's tasks appear below" line (`walk-plan-guidance-*`) | Banner + buttons only |
| Task rows | Description expanded (`walk-task-description-*`) | Title-only; description behind a **Details** tap (`walk-task-details-*`) |
| Harvest strip | "Picked some keeps the task open" hint (`walk-harvest-guidance-*`) | No hint |
| Reading sheet | Field helper text with typical ranges (`walk-reading-*-helper`) | Bare inputs, terser intro |
| Summary | Encouraging framing + tomorrow line (`walk-summary-subtitle`) | "Session logged." — stats-first |

### Permissions / role-based UI

Journal writes ride `plant_journals` RLS; sessions + visits are session-owner-write / home-member-read. Task mutations ride the existing `tasks` RLS. **Valve control (Phase 2)** is gated exactly like the Integrations device modal: the Open/Close controls only render when `can('integrations.control') || can('integrations.manage')` AND `valveControlMode(provider, controllable) !== "readonly"`; otherwise the row is state-display-only with an explanatory line. Manual readings ride the `area_*_readings` RLS (home members write).

### Error states

| State | Result |
|---|---|
| Route build fails | Full-screen error card, "Back" → origin (RHO-8) |
| Empty home / everything actioned today | "Nothing to walk today" empty state (a route with zero steps) |
| Task action fails | Toast on the row, row returns to pending — the walk stays put |
| Section note/photo save fails | Toast; sheet stays open |
| `findOpenSession` fails | Logged, treated as "no open session" — a fresh walk starts |
| `home-overview` walk view fails | Logged non-fatal; cards render without device panels (telemetry is enrichment, not skeleton) |
| Valve command fails | Toast with the extracted edge error; the row reverts to its previous state (optimistic pending indicator clears) |
| Manual reading save fails | Toast (validation message or generic); sheet stays open |
| Watchlist / plans queries fail (Phase 3) | Logged non-fatal; panels simply don't render (enrichment, like devices) |
| Activate maintenance fails | Toast; banner stays actionable for a retry — `activateMaintenanceBlueprints` inserts are idempotent-enough for the PlanStaging retry story (same behaviour as retrying from the Planner) |
| Harvest AI check can't read ripeness | Toast inside the sheet; the sheet stays open so the user picks a manual option (HarvestRipenessSheet's own contract) |

### Return-navigation contract (RHO-7 / RHO-8)

Unchanged: every exit returns to `location.state.from` (dashboard launcher passes `/dashboard`, Quick Access tile `/quick`), defaulting to `/quick`.

### Snap / Note sheet focus (RHO-6)

Unchanged on plant cards (scroll-into-view + focus, `prefers-reduced-motion` respected). Section sheets use `autoFocus` on the note textarea.

### Performance notes

- One bootstrap wave: the v1 7-query bootstrap + 3 extra reads (locations, taskEngine, section visits) — still a single round-trip wave.
- No per-card network; task actions are awaited per-row with inline busy state.
- The Plant Doctor chat FAB is not mounted on `/walk` (it overlapped the bottom-right skip control on desktop).

### Linked storage buckets

- `plant-images` — plant snaps under `walks/{homeId}/{inventoryItemId}/`, section snaps under `walks/{homeId}/sections/`.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Garden Walk is the **morning ritual** — and since v2 it's built so a whole day's gardening can happen inside it. It walks the way you walk: front door first (what needs attention today, the odd jobs that belong to no bed), then location by location, bed by bed, plant by plant. Chores appear where you're standing: the bed's tasks on the bed's card, the plant's tasks on the plant's card, your own to-dos on the very first card.

### Every flow on this view

#### 1. Start a walk

- Dashboard launcher or the wide Quick Access tile.
- If you abandoned a walk earlier today, Rhozly asks: **Resume walk** (everything you covered stays covered; skipped sections come back around) or **Start fresh**.

#### 2. The Home card

The first card frames the day:

- **Needs your eyes today** — up to three plants with active ailments or overdue tasks, and which bed they're in, so urgency never hides at the back of the route.
- **Look out for** — your active watchlist, right where it's useful: each pest, disease or invasive with how many plants are currently flagged, and (for newer gardeners) the first tell-tale symptom to scan for as you walk. Tap an entry to jump to the Watchlist — the walk waits, and offers Resume when you come back.
- **Plans in progress** — every active project with its phase ("Phase 2 of 5 · The Shed") and what moves it forward next, so you leave the house knowing which bed the project work is in.
- **Unassigned & personal tasks** — home chores that belong to no location ("sweep the potting bench") plus your personal list, marked with a *Personal* chip.
- Note / Snap for garden-wide observations. **Continue** when you're ready; **Skip section** if you want to head straight out.

#### 3. Location and area cards

Each location card shows what's ahead ("2 areas · 5 plants ahead") and its own tasks; each area card the same for the bed. Actions on every task row:

- **✓ Complete** — done on the spot. Recurring (ghost) tasks are handled properly — no duplicates, even if someone else ticked it off in another tab.
- **🗓 Postpone** — Tomorrow / +3 days / pick a date. Recurring tasks move just this occurrence; the schedule itself doesn't shift.
- **✗ Skip** — this occurrence won't nag again.

**Skip section** jumps the whole location or area — every bed and plant inside it — and remembers you did ("Skipped earlier — welcome back" when it returns).

#### 3c. Plans and the watchlist, woven into the beds

- **"Flagged in this bed"** — if any of the bed's plants carry an active watchlist ailment, the area card says so ("Aphid · 1 plant") before you even reach the plant cards. Tap through to the Watchlist for treatment steps.
- **"Part of {plan}"** — a bed with an active project shows the plan banner: which phase you're in, what's next, and how many of the plan's tasks are on today's walk (they're in the task list right below — ticking them off here moves the project exactly as it would from the Planner). When everything but maintenance is done, **Activate maintenance** finishes the project right from the walk — recurring care blueprints switch on and the plan completes. Earlier phases (sourcing plants, staging the bed) need the Planner's full tools — **Open plan** takes you there.

#### 3d. Harvest tasks — the full experience, mid-walk

A harvest task inside its window gets a **Harvest** button instead of a plain tick. It opens the same four options as the task's detail view:

- **Harvested** — the crop's done; the task completes, and Rhozly asks whether any of those plants reached the end of their life with this harvest (skip freely — most crops keep producing).
- **Picked some** — log today's haul (amount + unit + a note) without closing the task; it snoozes and comes back in 1/3/5/7 days for the next picking. The yield lands on the plant's stats, same as always.
- **Not yet** — snooze 3/5/7 days, never past the window's end.
- **Check with AI** — snap the crop; Rhozly reads ripeness and either says "go pick" or tells you how many days to wait (and snoozes accordingly).

A task whose window has already closed keeps it simple: ✓ logs it as harvested, ✕ marks it missed.

#### 3a. Sensors & valves on the cards you pass

Every card shows the kit that lives at that step — a probe by the shed on the Home card, the bed's sensors and valve on the bed's card (all of them, even when a bed has two probes):

- **Sensor chips** read like the dashboard's: moisture % with a Dry / OK / Wet band, soil temperature, and a low-battery flag. A reading over a day old greys out — trust your finger over a stale number.
- **Valve rows** show what the zone is doing: *Watering · N min left*, *Next water 06:30*, *Valve failed*, or *Idle*. If you're allowed to control valves, you can **open one right from the walk**: pick 5 / 10 / 15 minutes (or type a custom duration) and tap Open — the auto-off timer is armed on the device itself, so the water stops even if your phone dies in the borders. **Close now** ends it early. No permission or no control hookup? The row still tells you the state.

#### 3b. Log a soil reading where you stand

Area cards carry the bed's last logged readings ("41% · 16.5°C · last logged 3 days ago" — or a gentle nudge when the bed has never been read). Tap **Log reading**, type what your probe or finger says (moisture %, soil temp °C — either alone is fine), and it's saved **stamped right now**. The reading lands in the same place as sensor data, so the Area Coach, drydown profiles and the Readings tab all see it. It counts on your walk summary too. Need to backdate or log EC? That lives in the full Log Reading form on the Area's Readings tab.

#### 4. Plant cards

The classic experience, now with the plant's own task list on the card (a shared task shows "also covers N other plants" on the first of them). Harvest-window tasks get the full harvest strip right here (§3d) — ripeness check, partial picks and all.

#### 5. Summary

Plants visited, **sections visited**, **readings logged**, photos, notes, tasks completed, ailments flagged — plus a list of sections you skipped. **Walk what's left** re-runs the walk with everything you actioned removed; skipped sections come back first-class. New gardeners get a word of encouragement and a pointer at tomorrow; experienced gardeners get "Session logged." and the numbers.

#### 6. Your persona shapes the copy, never the data

Set your persona in your Garden Profile. **New gardener** (the default): guidance sentences under the sensor and readings panels, symptom hints on watchlist entries, expanded task descriptions, typical-range helper text on the reading sheet. **Experienced**: compact chips, raw values, descriptions behind a *Details* tap. Everything actionable is identical for both.

### Information on display — what every field means

| Element | Meaning |
|---|---|
| "Step N of M · {section}" | Position in the whole route and which section you're in. |
| Section subtitle | Location: areas + plants ahead. Area: its location + plant count. |
| *Skipped earlier* chip | You skipped this section earlier today — it's back because skipped ≠ done. |
| *Personal* chip on a task | From your personal list, not the home's shared board. |
| *Overdue* chip on a task | Past its due date (harvest tasks: past the window's end). |
| "also covers N other plants" | One shared task shown once, on the first of its plants you'll reach. |
| Band chip on plant cards | Why this plant ranks where it does within its bed. |
| Sensor chip (44% · OK) | Latest soil moisture + band from that device; greyed = reading over a day old. |
| "Watering · N min left" | The valve is running its countdown; the device closes itself when it ends. |
| "Valve failed" | The last command never reached the device — that zone may not have watered. |
| Soil readings strip (area) | The bed's last *logged* values (`areas.latest_soil_*`) — manual or sensor, whichever was newest. |
| "Look out for" entry (N plants) | An active watchlist ailment and how many plants currently carry it. Zero plants = on the watchlist but nothing flagged yet — that's the good kind. |
| "Flagged in this bed" | The count is scoped to *this bed's* plants only. |
| "Phase N of 5 · {label}" | The plan's current staging phase (Infrastructure → The Shed → Staging → Execution → Maintenance). |
| *Plan* chip on a task | That task belongs to an active plan — completing it advances the project. |
| "Snoozed" on a harvest row | The task will reappear on its next check date, always inside the window. |

### Tier-by-tier experience

| Tier | What you see |
|---|---|
| Sprout / Botanist | Full hierarchy, all task actions, notes + photos everywhere. |
| Sage / Evergreen | + fresh-hit band and Sparkles chips from the pattern engine. |

### Common mistakes / pitfalls

- **Continue vs Skip section.** Continue means "this card is done for today" — it won't reappear if you resume. Skip section means "later" — it will.
- **Completing a task doesn't advance the card.** Finish the card with Continue (sections) or All good / Skip (plants) when you're actually done looking.
- **Postponing a recurring task** moves *this occurrence only*. To change the rhythm, edit the blueprint in Schedule.
- **The 30-plant cap.** Big gardens surface the 30 most signal-heavy plants per walk; quiet plants rotate in as others are marked all-good. (One constant in the code changes this.)
- **A greyed sensor chip isn't zero** — it means the reading is over a day old. Check the device's battery or gateway before trusting or panicking over the number.
- **Opening a valve from the walk is real watering.** The countdown you pick is armed on the device (auto-off) — but it's still live water. If you only meant to record that you watered by hand, complete the watering *task* instead.
- **Logging a reading doesn't finish the bed's card.** Like tasks, readings keep you on the card — Continue when you're done with the bed.
- **Tapping a watchlist entry or "Open plan" leaves the walk.** Deliberately — you'll get the Resume prompt when you come back, with everything covered so far intact.
- **"Harvested" vs "Picked some".** Harvested closes the task for this window; Picked some logs a yield *and keeps it open*. Cut-and-come-again crops almost always want Picked some.
- **Harvest snoozes never pass the window.** Ask for 7 days with 2 left and you'll get 2 — the window's end is a hard stop.
- **Activate maintenance completes the plan.** It's the real phase-5 action, not a shortcut — recurring blueprints switch on immediately, same as pressing it in the Planner.

### Recommended workflows

- **Daily walk:** glance at the Home card's attention preview → Continue through the beds → clear each card's tasks where you stand → All good the healthy plants.
- **Dry-bed drill:** the bed's sensor chip reads Dry → open its valve for 10 minutes right there → log what your finger says in the next bed while the water runs.
- **No-hardware habit:** probe each bed on your walk and Log reading as you go — a week of walk readings gives the Area Coach a real baseline.
- **Short on time:** skip the far locations; this evening, "Walk what's left" brings them back.
- **Interrupted?** Just leave. Next launch offers Resume — nothing repeats, nothing is lost.

### What to do if something looks wrong

- **A section keeps reappearing** — you've been skipping it, not completing it. Tap Continue on its card.
- **A task shows on the "wrong" card** — tasks appear at their most specific home: plant beats area beats location beats home. A shared multi-plant task appears once, on the first of its plants in the route.
- **No device chips at all this walk** — the telemetry call quietly failed (the walk never blocks on it). Finish your walk; check Integrations after.
- **The valve row says failed** — the last command didn't reach the device. Head to Integrations → the device's detail modal to retry and check the connection.
- **"Nothing to walk today"** — no plants yet, or everything was already actioned today. That's the goal state, not a bug.

---

## Related reference files

- [Quick Access Home](./09-quick-access-home.md) — entry-point tile.
- [Quick Capture Journal](./11-quick-capture-journal.md) — the unassigned-journal pattern section notes/photos reuse.
- [Photo Timeline Tab](../08-modals-and-overlays/09-photo-timeline-tab.md) — walk photos union into this view.
- [Plant Journal Tab](../08-modals-and-overlays/10-plant-journal-tab.md) — walk notes appear here per-plant.
- [Ailment Watchlist](../03-garden-hub/02-watchlist.md) — active ailments feed the critical band AND the walk's "look out for" digest / per-bed context (Phase 3); watchlist taps land here.
- [Data Model — Ailments](../99-cross-cutting/06-data-model-ailments.md) — `ailments` + `plant_instance_ailments`, the watchlist-weaving substrate.
- [Data Model — Plans](../99-cross-cutting/05-data-model-plans.md) — `status` / `kind` / `staging_state`, the phase model `derivePlanPhase` mirrors.
- [Plan Staging](../04-planner/02-plan-staging.md) — the 5-phase surface whose Phase-5 mutation (`activateMaintenanceBlueprints`) the walk's plan banner reuses; "Open plan" lands in the Planner.
- [Task Modal](../08-modals-and-overlays/02-task-modal.md) — `HarvestRipenessSheet` / `HarvestPartialPickSheet` / `HarvestEndOfLifePrompt` are shared with the walk's harvest strip (Phase 3).
- [Pattern Engine](../99-cross-cutting/26-pattern-engine.md) — `user_insights` rows feed the fresh-hit band.
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — ghosts, tombstones, `unique_blueprint_date`; `src/lib/taskActions.ts` is a first-class mutation path.
- [Data Model — Homes](../99-cross-cutting/01-data-model-home.md) — locations/areas skeleton the route walks.
- [Data Model — Integrations](../99-cross-cutting/09-data-model-integrations.md) — `devices`, `device_readings`, `device_commands` (`auto_off_at`), `valve_events`, `automation_valve_queue` — the walk's telemetry + valve-control substrate.
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `home-overview` (`view: "walk"`), `integrations-ewelink-control`, `integrations-adapter-control`.
- [Integrations & Readings](../07-management/07-integrations-readings.md) — the full manual-reading form (backdating + EC) the walk's sheet is a thin sibling of.
- [Routing](../99-cross-cutting/21-routing.md) — `/walk` joins the focus-mode shell at **every** viewport width (RHO-18), not just mobile.

## Code references for ongoing maintenance

- `src/components/walk/GardenWalk.tsx` — page shell + state machine (resume, section skip jumps, summary plumbing, reading_logged visit rows)
- `src/components/walk/WalkSectionCard.tsx` — home/location/area card (sensor chips, latest-readings strip)
- `src/components/walk/WalkValveRow.tsx` — valve state + open-with-duration / close via the integrations control functions
- `src/components/walk/WalkReadingSheet.tsx` — manual reading capture (moisture/temp/EC, stamped now) over `areaReadingsService.logManualReading` + Bed profile diff-save; persona helper copy
- `src/lib/walkBedProfile.ts` — pure Bed profile diff + validation (only changed fields patch `areas`)
- `src/constants/areaProfileOptions.ts` — water-movement / nutrient-source stored-string options shared with `AreaAdvancedFields`
- `src/components/walk/WalkWatchlistPanel.tsx` — watchlist digest / per-bed context (Phase 3)
- `src/components/walk/WalkPlanBanner.tsx` — plan digest / actionable area banner incl. phase-5 activation (Phase 3)
- `src/components/walk/WalkTaskRow.tsx` — task row + postpone sheet + in-window harvest strip (mounts the Task Detail harvest sheets)
- `src/components/walk/WalkPlantCard.tsx` — plant card (+ its task rows, passing `plantName` for AI grounding)
- `src/components/walk/WalkSummaryCard.tsx` — end-of-walk view (readings stat, persona framing)
- `src/components/home/HomeMain.tsx` — the `dash-garden-walk` launch button (replaced the retired `WalkStartTile`)
- `src/lib/gardenWalk.ts` — `composeAndOrderWalk`, `composeWalkRoute`, `buildWalkRoute`, `MAX_PLANTS_PER_WALK`, `derivePlanPhase`, `WalkDevice` / `AreaLatestReadings` / `WalkWatchlistItem` / `WalkPlanDigest` types
- `src/lib/taskActions.ts` — shared complete/skip/postpone/`snoozeHarvestTask` mutation core
- `src/services/planStagingService.ts` — `activateMaintenanceBlueprints` (the walk's phase-5 action reuses it verbatim)
- `src/components/HarvestRipenessSheet.tsx` / `HarvestPartialPickSheet.tsx` / `HarvestEndOfLifePrompt.tsx` — shared with TaskModal / TaskList
- `src/hooks/usePersona.ts` — persona read (null ⇒ "new"); consumed by every walk component that varies copy
- `src/lib/valveControl.ts` — `valveControlMode` (shared with ValveControlPanel)
- `src/services/walkService.ts` — session + visit persistence, resume lookup
- `src/services/areaReadingsService.ts` — `validateManualReading` / `logManualReading` (shared with LogReadingModal)
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — `view: "walk"` branch + `shapeWalkDevices`
- `supabase/migrations/20260521150000_garden_walk.sql` — original tables + RLS
- `supabase/migrations/20260830000000_garden_walk_hierarchy.sql` — RHO-17 step-visit generalisation
- `tests/unit/lib/gardenWalk.test.ts` — banding + route composer + device-assignment + watchlist/plan-weaving + `derivePlanPhase` tests
- `tests/unit/lib/taskActions.test.ts` — mutation-core parity tests incl. `snoozeHarvestTask` window-capping
- `supabase/tests/homeOverview.test.ts` — `shapeWalkDevices` Deno tests (HOME-OV-011..016)
- `tests/e2e/specs/garden-walk.spec.ts` + `tests/e2e/pages/GardenWalkPage.ts` — hierarchical flow, resume, task actions, telemetry chips, valve control, reading sheet, watchlist digest + area context, plan banners, harvest strip, persona toggle
