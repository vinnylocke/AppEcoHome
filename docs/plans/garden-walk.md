# Plan — Garden Walk Mode

## Goal

A guided full-screen "walk through every plant in your garden" experience optimised for one-handed mobile use, designed to become the user's daily ritual.

The app picks one plant at a time and shows it as a single full-bleed card with:

- A recent photo.
- The most recent journal note (so the user remembers what they noticed last time).
- Any active ailments.
- Any due-today tasks for this instance.
- Any fresh pattern_hits / insights.

The bottom action bar lets the user, in one tap, take a photo, dictate a note, mark "all good", skip, or stop the walk. Each card is ~30 seconds. A 12-plant garden takes under 7 minutes.

Why this matters: the app today is reactive — users open it when they have a question. Garden Walk turns it into a daily ritual: morning coffee → open Rhozly → 5-minute walk → close. That's the retention multiplier.

## User-facing flows

### 1. Start a walk

- **Quick Access tile** — *"Garden Walk"* on `/quick` (gets the 5th tile or replaces one — see Design decisions below).
- Mobile-only by default. Desktop preview banner explains it's a mobile feature, with a "Start anyway" option.
- Tap → full-screen walk view at `/walk`.

### 2. Walk-in-progress

Full-screen card per plant. Layout (top → bottom):

- **Header**
  - Plant common name + area name pill.
  - Progress chip: *"3 of 12"*.
  - Stop button (top-right).
- **Hero photo** — most recent from the photo timeline (or species placeholder if none).
- **Context strip** (small chips, horizontal scroll)
  - Last note date · *"Smelled lovely · 3d ago"*
  - Any active ailment · *"⚠ Possible blight"*
  - Pattern hit · *"📈 Watering frequency drifted"*
  - Due today · *"💧 Watering due"*
- **Quick stats** (3 metrics)
  - Last watered date.
  - Last photo'd date.
  - Days since planted.
- **Bottom action bar** (sticky, always visible)
  - 📸 **Snap** — opens camera, writes a `plant_photos` row for this instance.
  - 📝 **Note** — opens Quick Capture pre-filled with this instance, returns to the walk on save.
  - ✓ **All good** — no issues, advance to the next plant.
  - ⏭ **Skip** — don't ask again in this walk session.
  - 🚫 **Stop** — exit walk, show end-of-walk summary.

Swipe-right also advances ("All good"); swipe-left skips. Long-press the photo opens it full-screen.

### 3. End of walk

- Summary card: *"You walked 12 plants in 6m 22s. 8 photos, 4 notes, 2 ailment flags."*
- One-tap actions:
  - "Set up tomorrow's walk reminder".
  - "Share a snapshot" (composite image with the day's photos for social / family WhatsApp).
- Returns to Quick Access.

### 4. Settings (per-home)

A small drawer on the walk's start screen:

- **Skip indoor plants** (default on).
- **Skip archived** (default on, can't be turned off).
- **Skip "all good" plants for N days** (default 7).
- **Ordering** — Smart (default) / Alphabetical / Newest first / Oldest first.

## App-reference docs consulted

- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — tile entry point.
- [docs/app-reference/02-dashboard/11-quick-capture-journal.md](../app-reference/02-dashboard/11-quick-capture-journal.md) — Note action delegates here.
- [docs/app-reference/08-modals-and-overlays/09-photo-timeline-tab.md](../app-reference/08-modals-and-overlays/09-photo-timeline-tab.md) — photo writes.
- [docs/app-reference/08-modals-and-overlays/10-plant-journal-tab.md](../app-reference/08-modals-and-overlays/10-plant-journal-tab.md) — note writes.
- [docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — instance is the unit of a walk card.
- [docs/app-reference/99-cross-cutting/26-pattern-engine.md](../app-reference/99-cross-cutting/26-pattern-engine.md) — pattern_hits feed the context strip.
- [docs/app-reference/03-garden-hub/02-watchlist.md](../app-reference/03-garden-hub/02-watchlist.md) — active ailments feed the context strip.
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — due-today tasks feed context + the "Done" action completes them.
- [docs/app-reference/99-cross-cutting/23-capacitor.md](../app-reference/99-cross-cutting/23-capacitor.md) — voice dictation comes via Capacitor speech-to-text.
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md) — `/walk` joins the focus-mode shell.
- [docs/app-reference/06-account/03-awards-tab.md](../app-reference/06-account/03-awards-tab.md) — new "Garden Walker" achievement.

## Data model

A single new table to back walk sessions (for stats + the "skip for N days" logic):

```sql
CREATE TABLE public.garden_walk_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  -- Summary metrics rolled up at end-of-walk for the achievement engine
  plants_visited        int NOT NULL DEFAULT 0,
  photos_taken          int NOT NULL DEFAULT 0,
  notes_added           int NOT NULL DEFAULT 0,
  tasks_completed       int NOT NULL DEFAULT 0,
  ailments_flagged      int NOT NULL DEFAULT 0
);

CREATE INDEX walk_sessions_home_user_idx
  ON public.garden_walk_sessions (home_id, user_id, started_at DESC);

CREATE TABLE public.garden_walk_visits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES public.garden_walk_sessions(id) ON DELETE CASCADE,
  inventory_item_id     uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  visited_at            timestamptz NOT NULL DEFAULT now(),
  outcome               text NOT NULL CHECK (outcome IN ('all_good', 'snapped', 'noted', 'ailment_flagged', 'skipped'))
);

CREATE INDEX walk_visits_session_idx ON public.garden_walk_visits (session_id);
CREATE INDEX walk_visits_item_idx    ON public.garden_walk_visits (inventory_item_id, visited_at DESC);
```

**Why two tables?** Sessions hold the rolled-up metrics for the Stats / Awards tabs and let us reconstruct a "last walked at" per instance. Visits hold the per-card outcome — needed for the "skip 'all good' for N days" logic and for future analytics ("plants the user keeps flagging").

**RLS:** standard home-membership + user-self pattern.

## Edge functions

None new. The walk talks to existing tables directly via supabase-js + RLS. The Note action invokes the existing Quick Capture flow.

## Cron / scheduling

None directly. The walk feeds the existing `pattern-scan` cron — fresh visits + notes give the pattern engine more signal.

Optionally (v2): a daily 07:00 home-tz cron that sends a push notification *"Time for your morning walk?"* to users who've opted in. Not in scope for v1.

## Ordering algorithm

`src/lib/gardenWalk.ts` exports `orderWalkPlants(items, signals)`. Priority bands (highest → lowest):

1. **Critical** — instance has any active `plant_instance_ailments` with severity ≥ medium.
2. **Overdue** — instance has any task with `status='Pending' AND due_date < today`.
3. **Due today** — task with `due_date = today`.
4. **Has a fresh pattern_hit** — `user_insights` row referencing this instance from the last 24 hours.
5. **Not walked in N+1 days** — last_walked_at on this instance > 7 days ago (or never).
6. **Everything else** — by area, then alphabetical.

Within each band, randomise to avoid the same plant always being first. Result is capped at the user's `max_per_walk` setting (default 30 — most gardens won't hit this).

**Exclusions:**

- Archived instances.
- Instances in areas with `is_indoor = true` (settings can toggle).
- Instances visited as "all_good" within the last `skip_all_good_days` (default 7).
- "Skipped" outcome instances from earlier today.

## State management

The walk is heavily client-state. Architecture:

- Walk list computed once at start (single supabase read with all joins).
- `useReducer` for the walk machine: `idle | loading | walking | finished | error`.
- Current card index in state; advance / back actions reduce.
- Outcomes buffered locally (`garden_walk_visits` rows written on advance, debounced).
- Session record written at start (with `ended_at` NULL); updated at end with final rollup.

Offline behaviour: if offline, outcomes queue via the existing `offlineQueue` ([docs/app-reference/99-cross-cutting/16-offline-queue.md](../app-reference/99-cross-cutting/16-offline-queue.md)) with a new kind `garden_walk_visit`. Photos go through the existing photo upload queue.

## Surfaces and where they slot

| Surface | Slot |
|---|---|
| Quick Access tile #5 | Slots in below The Library. Compact layout, blue or amber accent. Design decision below. |
| `/walk` route | Mounted under the focus-mode shell (full-screen, no top bar, no side nav, just a stop button). |
| End-of-walk summary | Replaces the walk card in-place with a celebration screen. |
| Awards tab | New badge "Garden Walker" (3-day streak), "Daily Stroller" (30-day streak). |
| Stats tab | New row: "Garden walks this month: 14 · 178 plants visited". |

### Design decision — where in Quick Access does it slot?

Quick Access currently has 4 tiles in a 2×2 grid. Garden Walk is the 5th. Options:

- **A.** Replace Quick Capture (since Note inside Garden Walk subsumes it). Risk: power users want capture without a walk.
- **B.** Move to a 3×2 grid (6 slots) — adds another empty cell.
- **C.** Make Quick Access a 2×3 grid (6 tiles, fewer columns on landscape).
- **D.** Keep the 2×2 grid and slot Garden Walk as a **wide tile** at the bottom of the grid, full-width. Frames it as the "ritual" — distinct from the 4 quick utilities.

**Recommend D.** It physically reads as "the big morning action" — and doesn't require shrinking other tiles. Title: *"Start a Garden Walk"*, subtitle: *"A guided tour of your plants — about 5 minutes."*

## Files to add

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_garden_walk.sql` | Tables + RLS |
| `src/components/walk/GardenWalk.tsx` | Page shell + state machine |
| `src/components/walk/WalkPlantCard.tsx` | Single plant card |
| `src/components/walk/WalkActionBar.tsx` | Sticky bottom action bar |
| `src/components/walk/WalkSettingsDrawer.tsx` | Pre-walk settings |
| `src/components/walk/WalkSummaryCard.tsx` | End-of-walk celebration |
| `src/components/walk/WalkStartTile.tsx` | The wide tile on Quick Access |
| `src/lib/gardenWalk.ts` | Ordering algorithm + walk-list query builder |
| `src/services/walkService.ts` | Session + visit writes |
| `docs/app-reference/02-dashboard/13-garden-walk.md` | New surface doc |

## Files to modify

| File | Change |
|---|---|
| `src/App.tsx` | Mount `<Route path="/walk">` under the focus-mode shell |
| `src/components/QuickAccessHome.tsx` | Add the wide Garden Walk tile below the 2×2 grid |
| `src/components/quick/QuickCapture.tsx` | Accept optional `prefilledInstanceId` so the walk's Note action lands inside an existing flow |
| `src/services/photoService.ts` (or equivalent) | Accept optional `walkSessionId` so the photo is attributable |
| `src/lib/achievements/*` | New badges: `garden_walker_3`, `garden_walker_30` |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | Document the new tile |
| `docs/app-reference/99-cross-cutting/21-routing.md` | Document `/walk` under focus mode |
| `docs/app-reference/06-account/03-awards-tab.md` | Add the new badges |
| `docs/app-reference/00-INDEX.md` | Add the new surface doc |

## Use cases — Sarah (amateur)

**Sunday morning, coffee in hand**

Sarah's been using the app for two months. She opens it → Quick Access → taps the big "Start a Garden Walk" tile.

The first card appears full-screen: **Lemon Balm** in the back bed.

- Hero photo from last Tuesday.
- Context chip: *"Smelled lovely · 5d ago"* (her last note).
- Quick stats: *"Last watered: Tue · Photo'd: Tue · 47 days since planted"*.

She taps **Snap** → camera opens, she takes a photo of the herbs, taps Use Photo → returns to the walk card with the new thumbnail. The photo's already saved to the timeline behind the scenes.

She taps **All good** → swipe-up animation → next card: **Tomato Roma** in the greenhouse.

- The context strip shows a red chip: *"⚠ Possible blight detected"*. This was a pattern_hit from earlier in the week she'd missed.
- She taps the chip — it expands inline showing the AI's reasoning + photo.
- She taps **Note** → Quick Capture opens, pre-filled with Roma. She dictates *"leaves look better today, removed a yellow one"*. Saves. Returns to the walk.

12 plants later, the summary appears:

> *Walk complete. 12 plants in 6m 18s.*
> *8 photos, 4 notes, 1 ailment confirmed for follow-up.*

She taps **Share snapshot** → a composite image of today's 8 photos gets generated → sends to her parents on WhatsApp.

The next morning she opens the app → the wide tile reads *"Continue your 2-day streak →"*. She walks again.

## Use cases — Marcus (expert)

**Daily 06:30, before work**

Marcus has been using the app for 18 months and his garden has 84 instances across 9 areas. He opens the app — the wide tile sits at the bottom of Quick Access.

He taps Start. The walk lists 23 plants today (ordered by his priority bands, plus all his usual rotation):

- Card 1: **Cucumber 'Marketmore'** — flagged as overdue (he's behind on staking). Context strip lists the overdue task with one-tap complete.
- He taps **Note** and dictates *"tied two new shoots to the cane, removed one runner"*. Hits Complete on the overdue task. Advance.
- Card 2: **Tomato 'Sungold'** — pattern_hit: *"Watering frequency drifted later this week — checking soil now?"*. He pinches the soil. *"Soil moisture good, skipping today's water."* Notes that. Swipe-right.

He fast-forwards through ~10 healthy plants with swipe-right ("All good") — they get logged as walked today and won't appear in tomorrow's walk for 7 days unless they flag something.

At the end:

> *Walk complete. 23 plants in 11m 04s.*
> *4 photos, 9 notes, 3 tasks completed, 2 ailment flags.*

His Stats tab updates: *"Walks this month: 28 · Streak: 28 days"*. His Awards tab unlocks **Daily Stroller (30-day streak)** in two days.

Behind the scenes, the pattern engine picks up his 9 fresh notes and queues new insights for tomorrow's walk.

## Edge cases / risks

- **Brand-new user with no plants** — the tile is hidden until they have at least 1 inventory_item. The first-time experience for a 1-plant garden is a single-card walk that finishes in 20 seconds — still rewarding.
- **Power user with 200 plants** — the `max_per_walk` setting (default 30) caps the list. We surface the highest-priority 30 and let them re-walk later.
- **Multiple gardeners in shared home** — visits are user-scoped. Marcus walking doesn't stop his wife from walking the same plants later that day; their session histories are independent.
- **Offline garden** — the whole walk works offline. Outcomes queue via offlineQueue; photos via the existing photo upload queue. Replay on reconnect.
- **Photo upload during walk feels slow** — keep the snap action returning to the walk immediately; upload queues in the background and the card thumbnail updates when it lands.
- **Walking the same plant twice in a day** — the second walk shows the plant if it wasn't completed cleanly, and skips it if it was. The "All good" outcome dedupes per (user, instance, date).

## Tier gating

| Tier | What they see |
|---|---|
| Sprout | Full walk (photo + note + task complete + skip). No AI-powered context-strip insights — they see only existing journal notes + ailments. |
| Botanist | Same as Sprout. |
| Sage | Adds pattern_hit chips in the context strip + "what I noticed last time" AI summary that synthesises the last 3 journal notes into one sentence. |
| Evergreen | Same as Sage. |

## Out of scope (v1)

- **Push notification reminder** *"Time for your morning walk?"* — comes in v2 once we have data on what time users walk.
- **Multi-area filter** — for v1 the walk covers the whole home. Later: walk a single area.
- **Audio-only mode** ("walk-talk") — the app reads each plant's context aloud as the user walks the actual garden. Big feature, later.
- **Two-person walks** — both members of a shared home walking together with merged outcomes.
- **AR overlay** linking walk cards to the actual physical location via the existing AR plumbing.

## Sequencing

1. Migration + RLS.
2. `gardenWalk.ts` ordering + the supabase query that builds the walk list.
3. Page shell + state machine (no fancy animations yet).
4. `WalkPlantCard` + action bar with Snap / Note / All good / Skip.
5. Session + visit writes via `walkService`.
6. End-of-walk summary.
7. Wide tile on Quick Access + route mount.
8. Settings drawer.
9. Achievements + Stats integration.
10. App-reference docs (new surface + Quick Access update + Awards update).
11. E2E spec: empty-garden tile hidden → add a plant → tile appears → start walk → snap → note → complete → summary lands.
12. Release notes + deploy.
