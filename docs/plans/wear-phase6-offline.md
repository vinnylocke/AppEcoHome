# Wear OS Phase 6 — Offline & sync

**Status:** ✅ BUILT & device-verified (6a read-cache + background multi-home sync; 6b/6c offline writes + queue flush). Two additions beyond the original plan, driven by device testing: (1) **offline-open** was fixed — `WearApp` treats `SessionStatus.RefreshFailure` (token refresh failed = offline) as authenticated, so the app opens offline with the stored session instead of spinning; (2) a **`ConnectivityMonitor`** replaced the discover-offline-by-timeout approach — offline reads/writes skip the network entirely (instant, no spinner) and the app flips back to online the instant `onAvailable` fires (flush + refetch), rather than waiting for realtime backoff.
**The last item from the original ask:** "work offline so you can get your task list before you head out, then when you get back to wifi it syncs back up."

---

## 1. Goal

Two capabilities:
1. **Read offline** — open the watch with no signal and still see your task list (the last-synced snapshot for the day), instead of an error.
2. **Write offline** — complete / postpone / delete / add tasks with no signal; the actions are **optimistically applied locally** and **queued**, then **replayed when connectivity returns** and reconciled against the server.

**Multi-home aware (per the owner):** because the watch can switch homes offline (Phase 5), the cache holds **every home the user belongs to**, not just the active one. While online, a **sync-down** proactively fetches + caches **today's tasks for ALL homes** (and the homes list itself), so switching home with no signal still shows that home's list.

Mirrors the phone's `src/lib/offlineQueue.ts` semantics (idempotent replay, per-user stamping, permanent-vs-transient error handling, capped backoff) — natively, with Room + WorkManager.

## 2. App-reference / prior art consulted
- `src/lib/offlineQueue.ts` — the phone's queue: `QueuedWrite` shapes, `flushQueue()` (drop permanent errors, retry transient with capped exponential backoff, `MAX_ATTEMPTS=8`), per-user stamping so a session never replays another account's writes, flush-on-online + startup + debounced retry.
- `src/lib/snapshotCache.ts` — the phone's read cache (JSON snapshot keyed by table+userId; `HomeDropdown` paints the cached home list offline).
- `docs/app-reference/99-cross-cutting/16-offline-queue.md`, `14-caching.md`.
- The watch's existing `TasksRepository` (get-today-tasks / mutate-task / addTask), `TasksViewModel` (fetch/act/realtime), `Prefs`.

## 3. New dependencies (Gradle — needs a sync)
- **Room:** `androidx.room:room-runtime`, `room-ktx`, and `room-compiler` via **KSP** (`com.google.devtools.ksp` plugin, matched to Kotlin 2.0.21 → KSP `2.0.21-1.0.x`).
- **WorkManager:** `androidx.work:work-runtime-ktx`.
- **Connectivity:** none (use platform `ConnectivityManager`).

This is the phase's one real footprint change — a Gradle sync + a KSP plugin. All added in the version catalog + `app/build.gradle.kts`.

## 4. Architecture

```
UI  ◄── observes ──  TasksViewModel  ──► TasksRepository ──► Supabase (get-today-tasks / mutate-task / add)
                          │  ▲                                     │ (on network failure)
              optimistic  │  │ reconcile (refetch)                 ▼
                          ▼  │                            Room: pending_write  ──► SyncWorker (WorkManager,
                    Room: day_cache  ◄────────────────────────────────────────────  NetworkType.CONNECTED)
```

- **`day_cache`** (Room) — one row per `(home_id, date)`: the resolved task list as JSON + `cached_at`. Written on every successful fetch **and** by the multi-home sync-down. Naturally holds many homes (it's home-keyed). Read when a fetch fails (offline).
- **Homes list cache** — the `home_members`→`homes` list cached (Room `home_cache` or a Prefs JSON blob) so the switcher renders offline.
- **Sync-down** — while online (app open + on reconnect), fetch today's tasks for **every** home and `day_cache` them, so an offline home-switch shows real data. Bounded (today only; ~N homes × 1 request). A home with no cached data offline shows a "not synced yet" empty state.
- **`pending_write`** (Room) — the queue: `id, user_id, home_id, action, payload_json, created_at, attempts, last_error`. `action ∈ complete | postpone | delete | add`.
- **`SyncWorker`** (WorkManager) — drains `pending_write` when the network is connected; replays each via `TasksRepository`; drops permanent failures, retries transient (WorkManager backoff); triggers a refetch on completion.

## 5. Files

**New — `data/local/`:**
- `AppDatabase.kt` — Room `@Database` (day_cache + pending_write), singleton.
- `DayCacheEntity.kt` + `DayCacheDao.kt` — get/put a day's task JSON.
- `PendingWriteEntity.kt` + `PendingWriteDao.kt` — enqueue/list/delete/bumpAttempt.
- `OfflineStore.kt` — thin facade the repo/VM use (serialise WatchTask lists ↔ JSON via kotlinx.serialization).
- `SyncWorker.kt` — `CoroutineWorker`; drains the queue; per-user guard; permanent-vs-transient handling; enqueues a one-shot `OneTimeWorkRequest` with a `NetworkType.CONNECTED` constraint + backoff.

**Changed:**
- `TasksRepository.kt` — the mutate methods return a typed result the VM can branch on; add helpers the worker calls to replay a `PendingWriteEntity`. No new server calls — replays go through the *existing* `mutate-task` / add insert (idempotent: `mutate-task` is CAS/23505-safe; add carries a client-generated `id` so a double-replay upserts, not duplicates).
- `TasksViewModel.kt`:
  - **Read:** after a successful `dayTasks` fetch, write the list to `day_cache`. On fetch failure, load `day_cache` for the viewed day and set an `offline` UI flag (show cached list, not an error).
  - **Write (`act`):** try the call; on a **network-shaped** failure → apply the mutation optimistically to the in-memory + cached list, enqueue a `pending_write`, kick `SyncWorker`. On success → clear any offline flag.
  - **Add:** same pattern; the new task gets a **client-generated UUID** so the offline insert + its replay are idempotent (upsert on id).
  - Enqueue `SyncWorker` on init + observe queue size for the indicator.
- `RhozlyWearApp.kt` — init the DB; enqueue a startup flush.
- `TasksScreen.kt` — a small **status chip**: "⚡ Offline" when the last fetch was cached, and "⟳ N queued" when `pending_write` is non-empty; both clear as sync completes.
- `AndroidManifest.xml` — WorkManager is auto-initialised (no change unless we disable the default initializer); add `ACCESS_NETWORK_STATE` permission.

## 6. Write semantics (idempotent replay)

- **complete / postpone / delete** replay through `mutate-task` — already **CAS-idempotent** (a re-applied complete/postpone/delete changes 0 rows the second time; the 23505→UPDATE recovery handles races). So a double-flush is safe.
- **add** replays as a `tasks` insert **upsert on `id`** (client-generated UUID) — a double-flush upserts the same row, never duplicates. (The current online add lets the DB generate the id; for offline-safety the client generates it — applied to both paths so they're identical.)
- **Optimistic local state** is best-effort UI; the **refetch after a successful flush is the source of truth** and replaces it.

## 7. Safety & edge cases
- **Per-user stamping:** each `pending_write` records the `user_id`; the worker skips/drops items whose user ≠ the current session (mirrors the phone). Sign-out clears the queue + cache.
- **Permanent vs transient:** a 4xx / constraint / RLS failure → drop the item (don't wedge the queue); a network failure → retry with WorkManager backoff, capped attempts.
- **Home scoping:** writes carry their `home_id`; replay targets that home (works with the Phase 5 switcher).
- **Ordering:** replay in `created_at` order so a complete-then-postpone on the same task applies in sequence.
- **Cache staleness:** the offline list is clearly marked "Offline"; a successful fetch overwrites it.

## 8. Tests / docs
- Kotlin: no unit harness on the wear module (device-verified, as prior phases). The **replay idempotency** it relies on is already covered by the `mutate-task` Deno tests.
- Docs: update `docs/wear-os-companion-plan.md` §5b + §9 (Phase 6), and `docs/app-reference/99-cross-cutting/16-offline-queue.md` (note the Wear companion's native queue).

## 9. Risks
- **KSP/Room version alignment** with Kotlin 2.0.21 — pick the matching KSP version; a mismatch is the most likely first build error.
- **WorkManager default initializer** — should work out of the box; if the app uses a custom Application (it does), ensure the manifest keeps the `androidx.startup` initializer (default) or we init WorkManager manually.
- **Optimistic/refetch divergence** — kept safe by always reconciling from the server after flush; the optimistic state is never trusted as final.
- Scope: this is the largest phase; I'll build it in the order below and you test each rung.

## 10. Build order (each is a device-testable rung)
1. **6a — Read cache.** Room + `day_cache`; write on fetch, fall back on failure + "Offline" chip. *Test: airplane mode → list still shows.*
2. **6b — Write queue + optimistic.** `pending_write`; offline writes apply locally + enqueue + "N queued" chip. *Test: airplane mode → complete a task → it moves to Done + shows queued.*
3. **6c — Flush (WorkManager).** `SyncWorker` drains on reconnect + refetches. *Test: re-enable network → queue drains, server reflects it, chip clears.*
4. **6d — Docs + polish.**

---

**Decision to confirm:** the offline write path stores actions in a durable **Room queue** and replays them via the existing functions (idempotent). If you'd prefer an even lighter v1 (read-cache only, no offline writes), say so — but the queue is what delivers "it syncs back up." I recommend the full plan.
