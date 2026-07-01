# Garden Walk

> A guided full-screen "walk every plant in your garden" experience. The app picks one plant at a time, shows context (last photo, last note, ailments, due tasks, fresh insights) and lets the user Snap / Note / All good / Skip / Stop in a single tap each. Designed to become the user's daily ritual.

**Route:** `/walk` (focus-mode shell — no top bar, no side nav)
**Source files (entry points):**
- `src/components/walk/GardenWalk.tsx` — page shell + state machine
- `src/components/walk/WalkPlantCard.tsx` — one full-bleed card per plant + sticky action bar
- `src/components/walk/WalkSummaryCard.tsx` — end-of-walk celebration
- `src/components/walk/WalkStartTile.tsx` — wide tile on Quick Access
- `src/lib/gardenWalk.ts` — walk-list query + ordering algorithm (`composeAndOrderWalk` is pure and unit-tested)
- `src/services/walkService.ts` — session + visit writes

---

## Quick Summary

The user opens the app, taps the wide **Start a Garden Walk** tile at the bottom of Quick Access, and is dropped into a full-screen card-per-plant flow. The ordering algorithm bumps anything with active ailments / overdue tasks / due-today tasks / fresh pattern insights to the top, then everything else stable-sorted by area + plant name. Each card shows a hero photo, the most recent journal note, status chips, and four primary actions plus Skip + Stop. Photos write to `plant_journals` with `subject="Garden Walk photo"`; notes write the same way with `subject="Garden Walk note"`. The end-of-walk summary card shows the rolled-up metrics from the session.

---

## Role 1 — Technical Reference

### Component graph

```
GardenWalk  (mounted at /walk, under the focus-mode shell)
├── on mount → walkService.startSession + buildWalkList run in parallel
├── reducer state: loading | empty | error | walking | finished
├── walking
│   └── WalkPlantCard
│       ├── Header (progress chip + Stop button)
│       ├── Hero image
│       ├── Name + area + band chip + context chips
│       ├── Last note card
│       ├── Quick stats (days planted · last photo'd)
│       ├── Sticky action bar
│       │   ├── Snap     → writes plant_journals row (image only)
│       │   ├── Note     → writes plant_journals row (description only)
│       │   ├── All good → records 'all_good' visit
│       │   └── Skip     → records 'skipped' visit
│       ├── Snap sheet  (PhotoUploader inside)
│       └── Note sheet  (textarea inside)
└── finished
    └── WalkSummaryCard
        ├── Walk metrics list (photos / notes / tasks / ailments)
        ├── Walk-what's-left button → re-fires the bootstrap callback,
        │   opens a new session, surfaces just the plants the user
        │   hasn't actioned today
        └── Done button → navigate(returnTo)  // origin, default /quick (RHO-7)
```

### Props received

`GardenWalk` is mounted from `App.tsx` with:

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` | Scope every query + RLS membership check |
| `userId` | `string` | `session.user.id` | Walk-session owner |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | Gates the pattern-hit chip on each card |

### State (local)

- `useReducer` with the state machine above (`WalkState`, `WalkAction`).
- `startedAtMs` captured once at mount for the end-of-walk duration.
- `settings` hydrated from `localStorage["rhozly:walk:settings"]` (falls back to `DEFAULT_WALK_SETTINGS`). Settings UI is v2; v1 stores defaults.

### Data flow — read paths

`buildWalkList(homeId, userId, settings)` issues these queries in parallel and merges:

| Query | Filter | Use |
|---|---|---|
| `inventory_items` | `home_id = X` and `status != 'Archived'` | The list to walk |
| `plant_journals` | `home_id = X`, `inventory_item_id IS NOT NULL`, ordered DESC | Latest note + image per item |
| `plant_instance_ailments` | `home_id = X`, `status = 'active'` | Critical-band assignment |
| `tasks` | `home_id = X`, `status = 'Pending'` | Overdue + due-today counts (matched via `inventory_item_ids @> [id]` client-side) |
| `user_insights` | `user_id = X`, undismissed, last 2 days | Fresh-hit band assignment (Sage+) |
| `garden_walk_visits` | `visited_at >= today - skipAllGoodDays` | Today's same-day dedupe + recent "all good" demotion |
| `plants` | `id IN (species ids in shed)` | Scientific name + thumbnail per item |

The pure helper `composeAndOrderWalk` does band assignment + sort. Bands (highest priority first): `critical` → `overdue` → `due_today` → `fresh_hit` → `stale` → `everything_else`.

### Data flow — write paths

| Trigger | Call | Notes |
|---|---|---|
| Mount | `INSERT garden_walk_sessions (home_id, user_id)` | One row per walk; `ended_at` left NULL |
| Snap save | `INSERT plant_journals (inventory_item_id, subject, image_url)` then `INSERT garden_walk_visits (session_id, outcome='snapped')` | The PhotoUploader uploads to `plant-images/walks/{homeId}/{itemId}/...` first |
| Note save | `INSERT plant_journals (inventory_item_id, subject, description)` then visit row with `outcome='noted'` |
| All good | `INSERT garden_walk_visits (outcome='all_good')` |
| Skip | `INSERT garden_walk_visits (outcome='skipped')` |
| End-of-walk | `UPDATE garden_walk_sessions SET ended_at=now(), plants_visited, photos_taken, notes_added, tasks_completed, ailments_flagged WHERE id = X` |

Visit writes are fire-and-forget — the walk advances immediately and the row lands in the background.

### Edge functions invoked

None directly. The walk is pure supabase reads + writes via RLS.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|---|---|
| `pattern-scan` / `pattern-evaluate` | The fresh-hit band uses `user_insights` rows surfaced by these crons. More walks → more journal notes → more pattern signal. |

### Realtime channels

None. The walk reads once at mount and never re-fetches mid-walk.

### Tier gating

| Tier | Differences |
|---|---|
| Sprout | Full walk (photo / note / all good / skip). No fresh-hit band (no `user_insights` for non-AI tiers). |
| Botanist | Same as Sprout. |
| Sage | Adds the fresh-hit band + a Sparkles chip on plants with new insights. |
| Evergreen | Same as Sage. |

### Beta gating

None.

### Permissions / role-based UI

| Permission | Effect |
|---|---|
| `shed.edit` | Implicit — required to write journal entries. RLS on `plant_journals` enforces. |

Sessions + visits are user-scoped per the migration policies: any home member can read, only the session owner can mutate.

### Error states

| State | Result |
|---|---|
| Build walk-list fails | Full-screen error card with a **"Back"** button (`garden-walk-error-back`) that returns to the origin (RHO-8) |
| Empty home (no inventory_items, or all archived / indoor with skipIndoor) | Friendly "Nothing to walk today" empty state with a **"Back"** button (`garden-walk-empty-back`) returning to the origin (RHO-8) |
| Snap / Note save fails | Inline toast; the card stays open so the user can retry |
| Network drops mid-walk | Walk advances on local state regardless; visit rows replay via Supabase client retry. End-of-walk update may fail silently — the summary still renders |

### Return-navigation contract (RHO-7 / RHO-8)

Every exit (Done, Stop, empty, error) returns to the surface the walk was **launched from**, not a hardcoded `/quick`. The launch sites pass the origin in router state:

| Launch site | `navigate("/walk", { state: { from } })` |
|---|---|
| Dashboard launcher (`HomeDashboard.tsx`, `dash-garden-walk`) | `from: "/dashboard"` |
| Quick Access tile (`WalkStartTile.tsx`, `quick-tile-walk`) | `from: "/quick"` |

`GardenWalk` reads `useLocation().state?.from` into `returnTo`, defaulting to `/quick` when absent (a hard refresh mid-walk drops `location.state`, so the mobile Quick Access menu is the safe fallback). All four exits call `navigate(returnTo)`.

### Snap / Note sheet focus (RHO-6)

The Snap and Note sheets are `fixed inset-0 z-50` overlays. On a wide landscape screen their actionable content is top-aligned with empty space below, so a plain conditional mount looked like nothing happened. A `useEffect` keyed on the active `sheet` scrolls the sheet's own `overflow-y-auto` body into view (`walk-snap-sheet-body` / `walk-note-sheet-body`) and moves focus inside it — the Note sheet's `<textarea autoFocus>` keeps its own focus; the Snap sheet (no natural target) focuses its scroll body. Motion respects `prefers-reduced-motion`.

### Performance notes

- One bootstrap supabase round-trip (6 parallel queries + 1 sequential plants lookup) — typically <500ms on a normal home.
- No per-card network: each card renders entirely from the in-memory walk list.
- PhotoUploader compresses images client-side before upload (existing component, 1600px / 85% quality cap).

### Linked storage buckets

- `plant-images` — walk snaps upload under the path prefix `walks/{homeId}/{inventoryItemId}/`.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Garden Walk is the **morning ritual**. You're holding a coffee, you're about to head outside, and you want a quick, one-screen-per-plant prompt to check in on every plant in the garden. It's not a list, not a dashboard — it's a card-by-card walk-through that respects how an experienced gardener actually inspects their garden: one plant at a time, eyes open for problems, hand reaching for the secateurs only when something needs attention.

For new users, it's the easiest possible way to learn the rhythm of garden care — the app surfaces what to look at, you decide what to do.

### Every flow on this view

#### 1. Start a walk

- Open Quick Access on mobile.
- Tap the wide **Start a Garden Walk** tile at the bottom.
- ~1 second of loading while the walk list is built.
- First card appears.

#### 2. Work a card

Each card answers four questions in one glance:

- *What plant am I looking at?* — name + scientific name + area + (optional) hero photo.
- *What's the situation?* — band chip (Needs attention / Overdue / Due today / New insight / Catch-up) + context chips (active ailments, overdue tasks, due today, new insights).
- *What was I thinking last time?* — the most recent journal note in full.
- *How is it doing in general?* — days since planted, days since last photo.

Then four actions:

- **📸 Snap** — opens a photo sheet, take a quick photo, save. The photo lands in the plant's journal timeline with subject *"Garden Walk photo · {date}"*.
- **📝 Note** — opens a textarea, jot anything. Saves as a journal entry with subject *"Garden Walk note · {date}"*.
- **✓ All good** — no issues. Records the visit and advances. The same plant won't appear in the walk again for 7 days unless something flags it.
- **⏭ Skip** — don't ask again today, but don't mark it as fine.
- **🚫 Stop** — exit walk early. The summary still shows for what you did walk.

#### 3. End-of-walk summary

When you advance past the last card (or hit Stop):

- *"You walked N plants in X minutes Y seconds."*
- Stats: photos taken, notes added, tasks completed, ailments flagged.
- **Walk what's left** → re-fires the walk with the same-day-visited filter on, so it naturally surfaces just the plants you haven't actioned today. If there's nothing left, you land on the friendly *"Nothing to walk today"* empty state — a satisfying signal that the garden's covered.
- **Done** → back to where you started the walk (the Dashboard if you launched it from there; Quick Access on mobile).

### Information on display — what every field means

| Element | Meaning |
|---|---|
| Progress chip ("3 of 12") | Which card you're on out of the total. |
| Band chip | Why this plant is at this position in the walk. *Needs attention* = active ailments; *Overdue* = a task is past due; *Due today* = a task is scheduled today; *New insight* = the pattern engine spotted something in the last two days. |
| Context chips | Counts for each kind of signal — quick visual cue. |
| Last note card | The most recent journal entry (any source) for this plant. |
| Days planted | How long this instance has been in the ground. |
| Last photo'd | When the latest journal entry with an image was added. |

### Tier-by-tier experience

| Tier | What you see |
|---|---|
| Sprout / Botanist | All bands except fresh-hit. Snap, Note, All good, Skip, Stop all work. |
| Sage / Evergreen | + the fresh-hit band and a Sparkles chip on plants with new pattern insights. |

### New user vs returning user vs power user

- **Brand-new user** — adds one plant, walks it, sees the empty state CTA the next day until they assign more.
- **Returning user (5–15 plants)** — walk takes 3–6 minutes. Most cards are "All good" with the occasional Snap when something looks different.
- **Power user (50+ plants)** — walk caps at 30 plants (the most signal-heavy ones); after a few days of "All good" tags, the same plants drop out for a week and others bubble up.

### Common mistakes / pitfalls

- **Tapping All good when there IS something wrong.** Removes that plant from your walks for 7 days. If you realise after the fact, opening the plant in The Shed and adding a journal note brings it back into the next walk.
- **Skip vs Stop.** Skip moves to the next plant; Stop ends the entire walk.
- **Multiple users in a shared home.** Walks are per-user — your spouse walking the garden doesn't change what shows up in your walk later that day.

### Recommended workflows

- **Daily morning walk** — Quick Access → Start a Garden Walk → coffee mug in one hand, phone in the other, ~5 minutes.
- **End-of-week inspection** — same flow, but slow down on plants in the *Needs attention* band; log a note explaining the diagnosis.
- **First walk after a holiday** — expect many cards. Skip the ones that are obviously fine; Note the ones that surprised you.

### What to look out for

- **"Nothing to walk today"** — you have no plants yet, or every plant is archived / indoor with skipIndoor on. Add a plant in The Shed and assign it to an outdoor area.
- **Slow first card** — the bootstrap query is a single round-trip; if it takes more than 2 seconds, your connection is the culprit. Try again.
- **Stop button feels harsh** — it's intentional. You can come back to the walk later; Stop just commits what you've done so far to the summary.

---

## Related reference files

- [Quick Access Home](./09-quick-access-home.md) — entry-point tile.
- [Quick Capture Journal](./11-quick-capture-journal.md) — sibling write path for unassigned notes.
- [Photo Timeline Tab](../08-modals-and-overlays/09-photo-timeline-tab.md) — walk photos union into this view.
- [Plant Journal Tab](../08-modals-and-overlays/10-plant-journal-tab.md) — walk notes appear here per-plant.
- [Ailment Watchlist](../03-garden-hub/02-watchlist.md) — active ailments feed the critical band.
- [Pattern Engine](../99-cross-cutting/26-pattern-engine.md) — `user_insights` rows feed the fresh-hit band.
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — task counts feed the overdue / due-today bands.
- [Routing](../99-cross-cutting/21-routing.md) — `/walk` joins the focus-mode shell.

## Code references for ongoing maintenance

- `src/components/walk/GardenWalk.tsx` — page shell + state machine
- `src/components/walk/WalkPlantCard.tsx` — single plant card
- `src/components/walk/WalkSummaryCard.tsx` — end-of-walk view
- `src/components/walk/WalkStartTile.tsx` — Quick Access entry tile
- `src/lib/gardenWalk.ts` — pure ordering helper (`composeAndOrderWalk`) + supabase fetch (`buildWalkList`)
- `src/services/walkService.ts` — session + visit persistence
- `supabase/migrations/20260521150000_garden_walk.sql` — tables + RLS
- `tests/unit/lib/gardenWalk.test.ts` — band assignment + sort tests
