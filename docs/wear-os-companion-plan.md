# Rhozly Wear OS Companion — Build Plan (Option 3, native)

**Status:** PLAN — for review. No code until approved + your dev environment is set up
(see the companion doc [`wear-os-companion-setup.md`](./wear-os-companion-setup.md)).
**Date:** 2026-07-23

## 1. Goal & scope

A small, standalone **Wear OS** app for the Pixel Watch that does *task management only* —
the thing you actually want on your wrist:

- **See today's tasks** for the active home.
- **Switch between homes.**
- **Complete / Postpone / Delete** a task.
- **Add a new task** (voice-first — the natural watch input).

It talks **directly to your existing Supabase backend** (Postgres + RLS + Auth). No plant
management, AI, weather, planner, etc. — this is a focused companion, not a port of the app.

**Non-goals (v1):** anything beyond tasks; offline queue; complications/Tiles (nice later,
see §9); tablet/phone reuse.

## 2. Architecture & tech choices

- **Native**, per your decision: **Kotlin + Jetpack Compose for Wear OS** (`androidx.wear.compose`).
- **Standalone app** — the watch runs it on its own Wi-Fi/LTE, talking to Supabase directly
  (no dependency on the phone being nearby).
- **Local-first data layer** (a **Room** DB on the watch) so it works **offline** — the UI always
  reads local; a small sync engine keeps Room ↔ Supabase (fetch on open/reconnect + Realtime while
  open; queue + flush writes via **WorkManager** on reconnect). See §5b.
- **Backend = your existing Supabase.** No new tables. Auth via GoTrue, data via PostgREST,
  the **same RLS** that already protects your web app. The only *possible* new backend piece
  is one small edge function for the task list — see §6, the ghost-task decision.
- **Supabase from Kotlin:** the **`supabase-kt`** community SDK (Auth + Postgrest modules), or
  plain **Ktor** hitting the REST endpoints. `supabase-kt` is the lower-effort path and mirrors
  `supabase-js` closely.
- **Config:** the app needs your `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
  (the publishable/anon key is designed to be client-embedded; RLS is what protects the data).
  Stored in the Wear app's `local.properties` / `BuildConfig`, never committed.
- **Package name:** reuse **`com.rhozly.app`** (same as the Capacitor phone app) so that, when
  you eventually publish, it's **one Play listing** — Play serves the phone build to phones and
  the watch build to watches, keyed on the watch feature flag (see §8).

## 3. Project structure

Recommended: a **separate, self-contained Android Studio project** living in this repo at
`wear/` (kept apart from the Capacitor `android/`, which is a different toolchain). It's still on
this branch; it just doesn't share a Gradle build with the web app.

```
wear/                          ← new, standalone Gradle project
  settings.gradle.kts
  build.gradle.kts
  gradle/  gradlew  gradlew.bat
  app/
    build.gradle.kts           ← applicationId "com.rhozly.app", minSdk 30, Wear deps
    src/main/
      AndroidManifest.xml       ← <uses-feature android.hardware.type.watch required="true">
      java/com/rhozly/wear/
        MainActivity.kt
        data/                   ← Supabase client, auth, task + home repositories
        ui/                     ← Compose-for-Wear screens
        RhozlyWearApp.kt
      res/
```

`applicationId = "com.rhozly.app"` is the one line that ties it to the single Play listing.

## 4. Screens & UX (round-screen, glanceable)

1. **Auth** — first launch: sign in. Options (decide in §7): email + password (watch keyboard /
   voice dictation), or a phone→watch code handoff. Session persists after first login.
2. **Today's tasks** — a `ScalingLazyColumn` (the Wear list) of today's tasks for the active home:
   title, a due/overdue hint, a big tap target. Swipe-to-dismiss = back (Wear convention).
3. **Task actions** — tap a task → a compact action screen: **Complete**, **Postpone**
   (Tomorrow / +N days), **Delete**. Confirm destructive (Delete) inline.
4. **Add task** — a mic button → Wear speech-to-text → "water the tomatoes" → pick a date
   (default today) → save. Voice is the primary input; a fallback text field for edits.
5. **Home switcher** — a top chip / overflow listing your homes (from `home_members`); picking
   one re-scopes the list. Remembers the last-used home.

## 5. Data & auth layer (maps to existing tables)

Everything below already exists — the watch just reads/writes it under the user's RLS.

- **Auth:** Supabase GoTrue. `supabase-kt` Auth signs in and persists the session on the watch.
- **Homes:** list from `home_members` (the user's homes); the "active home" is the
  `user_profiles.home_id` pointer today. The watch keeps its own selected-home and scopes
  queries by `home_id`.
- **Tasks read:** the `tasks` table, filtered by `home_id` + due date. **⚠️ Ghost tasks** — the
  web app's list also contains *virtual* recurring instances generated at runtime
  (`TaskEngine.fetchTasksWithGhosts`, IDs `ghost-{blueprint_id}-{date}`) that are **not in the
  DB**. A watch that only queries `tasks` will **miss recurring routines** until they're
  materialised. This is the one real design fork — see §6.
- **Task write — ✅ BUILT & DEPLOYED (2026-07-24) as the `mutate-task` edge function**, not a direct
  client write. The read payload (`get-today-tasks`, 7 cols) can't feed a faithful write (~15 cols),
  there are **no DB triggers on `tasks`** (so the pattern-engine `user_events` row must be emitted by
  code), and the branches are heavy — so the write path is a service-role function mirroring
  `src/lib/taskActions.ts` + the inline `TaskList` delete. Pure planner in `_shared/taskWrite.ts`
  (`planTaskMutation`, 20 tests). The verified branch matrix (corrects the simplified sketch this
  section used to carry):
  - **Complete:** physical (any) → `UPDATE status='Completed', completed_at, completed_by` (keep
    `due_date`); ghost → INSERT full `buildGhostPayload` row, `23505 → UPDATE` recovery.
  - **Postpone** (single occurrence): standalone → `UPDATE due_date`; **blueprint-linked physical →
    tombstone (`Skipped`) + INSERT Pending at the new date** (NOT a plain due_date move); ghost →
    Skipped tombstone at the old date + Pending at the new date. Never `status='Postponed'`.
  - **Delete:** standalone → hard `DELETE`; **blueprint-linked physical → tombstone (`Skipped`)**, never
    hard-delete (or the cron/ghost engine regenerates it); ghost → Skipped tombstone; series delete →
    `DELETE task_blueprints` (CASCADE), behind the watch hard-confirm.
  - **Add:** deferred to Phase 4.
  - `unique_blueprint_date` governs materialisation; the handler self-enforces auth + scope + home-match
    (service role bypasses RLS) and is CAS-idempotent. See docs/plans/wear-phase3-task-actions.md.

## 5a. Sync & Realtime — live updates across devices

Yes — the watch uses the **same Supabase backend**, so it syncs the same way the web + phone do,
with one watch-specific caveat.

**How web/phone do it today:** `useHomeRealtime(table, refetch)` (`src/hooks/useHomeRealtime.ts`)
subscribes to **Supabase Realtime** (Postgres change events over a WebSocket) for home-scoped
tables and re-fetches when a row changes (debounced). So when any home member adds/edits a task on
any device, every *open* client updates within a second or two.

**On the watch (app in the foreground):** identical — a `supabase-kt` Realtime subscription on
`tasks` (home-scoped); on any change, re-call `get-today-tasks` and update the list. A task you add
on your PC, or another member adds at the home, **appears on the watch while you're looking at it**.

**The watch caveat (realistic):** Wear OS aggressively suspends backgrounded apps and kills
persistent connections to save battery — you don't keep a WebSocket open in the background on a
watch. So:
- **App open →** live sync via Realtime (as above).
- **App closed/backgrounded →** no live push; it **refreshes to the latest on open** (always current
  when you raise your wrist and open it). It won't silently update in the background like a plugged-in
  PC tab.
- **To be *alerted* while not looking →** the **push-notification** layer (FCM) — the phone app
  already has the infra; the backend sends a push on the event and Wear mirrors phone notifications
  automatically. Optional add-on, not core v1.

**Consistency is never at risk** — the watch reads the same RLS-scoped source of truth; only *how
instantly* the on-screen list reflects a change varies (instant while open, on-open otherwise).

**✅ BUILT (Phase 2b, 2026-07-24).** `TasksViewModel.startRealtime()` opens one `supabase-kt` Realtime
channel (`home-tasks-{homeId}`) on `tasks` filtered by `home_id`, authenticated by the watch's own
session so **RLS scopes it** (you only get your home's changes). Any INSERT/UPDATE/DELETE → a
**silent, debounced** re-call of `get-today-tasks` for the viewed day (no spinner flash; a transient
socket error keeps the current list). The channel is **ViewModel-scoped** (foreground-only) and removed
in `onCleared`, so no background WebSocket drains the battery. Deferred: gap-reconciliation on reconnect
(a missed event during a flap is caught by the next change or on-open) and a finer resume/pause
tear-down (Phase 7 polish). Needs the `supabase-realtime-kt` dep (`install(Realtime)`).

## 5b. Offline & sync — use it anywhere, reconcile later

Yes — and it's a natural fit (watches are often off-wifi, and the garden may be out of range). Your
web/phone app already establishes the pattern (`src/lib/offlineQueue.ts` +
`snapshotCache`/`dashboardCache`): **cache reads for offline viewing, queue writes while offline,
flush on reconnect.** The watch mirrors it, Wear-style:

- **View offline** — the watch keeps a **local cache (Room DB)** of the last-synced task list. Sync
  while on wifi / near your phone, then open it in the garden with no connection and your list is
  there. *(Get your tasks before you head out → yes.)*
- **Act offline** — Complete / Postpone / Delete / Add apply **optimistically** to the local cache
  (UI updates instantly) and get **queued locally** (mirrors `enqueue()`).
- **Sync back up** — when the watch regains a path to Supabase — its own **wifi/LTE**, *or* **routed
  through your paired phone over Bluetooth when nearby** — a background **WorkManager** worker
  flushes the queue and re-fetches to reconcile. Same idea as the web's `flushQueue()` on reconnect,
  but WorkManager can run it **even while the app is closed**, so it catches up on its own.

**Architecture impact:** the data layer becomes **local-first** — Room is the UI's source of truth,
and a small sync engine keeps Room ↔ Supabase (fetch via `get-today-tasks` on open / reconnect /
Realtime; queue + flush for writes). The UI always reads local and never blocks on the network. Its
own phase (below), not free.

**Honest caveats:** it's a **Kotlin reimplementation** (Room + WorkManager) of your offline pattern,
not a port; **conflicts** (a task changed elsewhere while offline) are rare + low-stakes for simple
task actions — reconcile on flush (re-fetch / last-write), same spirit as the web queue.

## 6. Key design decision — ghost tasks — ✅ DECIDED: **B (edge function)**

To make the watch's "today" match the phone's, we handle recurring ghosts one of three ways:

- **A. Persisted-only (simplest v1).** Query `tasks` directly; show only real rows. Recurring
  routines that haven't been materialised won't appear on the watch until acted on elsewhere.
  Fastest to ship; incomplete list.
- **B. A small edge function `get-today-tasks` (recommended).** One new Supabase function that
  runs the ghost-resolution server-side and returns the resolved list for a home+date. Both the
  watch *and* (optionally) the web app call it → identical data, no Kotlin reimplementation.
  Modest new backend work; correct list. This is the clean answer.
- **C. Reimplement the ghost engine in Kotlin.** Faithful but the most work + a second copy of
  load-bearing logic to keep in sync. Not recommended.

**Recommendation: B.** It keeps one source of truth and makes the watch trivial to build.

**✅ BUILT (2026-07-23) — and it turned out much lighter than feared.** A full port of the browser
engine was *not* needed: the `generate-tasks` cron already **materialises frequency recurring tasks**
into the `tasks` table (7 days ahead), and only **seasonal WINDOW tasks (Harvesting/Harvest/Pruning)
are ghost-only**. So for a single day, `get-today-tasks` = **persisted Pending tasks (due ≤ today)**
`+` **seasonal-window ghosts** projected via the existing `_shared/annualWindows.ts` (suppressed when
the home already has a task row for that blueprint+window). Files:
`supabase/functions/get-today-tasks/index.ts` + the pure, tested `supabase/functions/_shared/todayTasks.ts`
(7 Deno tests). Auth = `requireAuth` + `requireHomeMembership`. **Not yet deployed** — held until the
watch's task list (Phase 2) needs it.
**Known v1 gap:** frequency-recurring tasks rely on the cron keeping them materialised (it does, 7
days ahead); if the cron were disabled/lagging, a not-yet-materialised recurring instance could be
missing for that day. Acceptable given the cron is a core, always-on mechanism.

## 7. Auth-on-watch — ✅ DECIDED: **A (email + password)**

- **A. Email + password on the watch** — Wear keyboard is small but works; voice dictation helps.
  Simplest, no extra plumbing.
- **B. Phone→watch handoff** — the phone shows a short code / QR, the watch enters it to claim a
  session (a small device-code flow). Nicer UX, more to build.
- **Recommendation: A for v1**, revisit B if entry is annoying.

## 8. Publishing later (one listing)

Not part of v1, but the plan bakes it in: same `applicationId` (`com.rhozly.app`) + the watch
`uses-feature` flag means Google Play serves the right build per device from a **single listing**
(phone build → phones, watch build → watches). You upload the watch APK/bundle to the *same* Play
Console app; Play routes by form factor. Manage version codes per Play's multi-APK rules.

## 9. Build phases

| Phase | Deliverable |
|------|-------------|
| **0 — Scaffold** | The `wear/` Gradle project, manifest (watch feature), Compose-for-Wear skeleton, `supabase-kt` wired with your URL+key, runs on the Wear emulator showing "Hello". |
| **1 — Auth** | Sign in (option §7) + session persistence; a signed-in landing screen. |
| **2 — Task list (+ Realtime)** | Today's tasks for the active home (via §6's chosen path), round-screen list, live Realtime updates while open (§5a). Reads from the local Room cache. |
| **3 — Actions** | Complete / Postpone / Delete on a task, writing to Supabase like the web app. |
| **4 — Add task** | Voice-first add flow → date → insert. |
| **5 — Home switcher** | List homes, switch, re-scope; remember last home. |
| **6 — Offline & sync** | Room as the UI source of truth; optimistic local writes + a queue; WorkManager flush + re-fetch on reconnect (§5b). Turns actions 3–5 offline-capable. |
| **7 — Polish** | Overdue styling, empty/error/loading states, manual refresh; (optional later: a Tile + complication for glanceable "N tasks due"). |

## 10. Division of labour (important)

- **I author all the Kotlin/Compose/Gradle here**, on this branch, iteratively.
- **You build, emulate, and sideload** in Android Studio (see the setup doc). Because I can't run
  a Wear build or flash your watch from this environment, the compile-and-run loop is on your
  side: you Run it, and paste back any Gradle/runtime errors + how the screens look; I fix and we
  iterate. (This is different from the web app, where I run the full loop here.)

## 11. Risks & notes

- **Can't verify on-device from here** — the iterate loop needs you in Android Studio (see §10).
- **`supabase-kt` maturity** — it's community-maintained; if a module is fiddly we fall back to
  Ktor + raw PostgREST/GoTrue calls (still straightforward).
- **Ghost tasks** — §6 is the load-bearing decision; B (edge function) is cleanest.
- **Voice input reliability** on Wear varies; keep a text fallback.
- **Round-screen layout** — Compose for Wear handles it, but expect a few iterations to get
  padding/scaling right on the actual watch vs the emulator.

## 12. What I need from you to start

1. Approve this plan (and pick §6 A/B and §7 A/B).
2. Do the one-time environment setup in
   [`wear-os-companion-setup.md`](./wear-os-companion-setup.md).
3. Then I scaffold **Phase 0** and you run it on the emulator to confirm the toolchain works
   end-to-end before we build features.

## Related
- Companion setup + test guide: [`wear-os-companion-setup.md`](./wear-os-companion-setup.md)
- Task action logic to mirror: `src/lib/taskActions.ts`, `src/lib/taskEngine.ts`
- Supabase client shape: `src/lib/supabase.ts`
