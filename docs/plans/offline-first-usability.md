# Offline-first usability — plan of record

**Date:** 2026-07-08 · **Ask:** the app should be usable in a no-signal garden — add/complete tasks, add manual plants, notes, journals, layout amendments, automations — then sync when connection returns. Plus: an offline indicator, a "Sync now" item in the user dropdown, auto-sync on reconnect, and internet-only features that STOP you with a "no connection" message before use.

**References consulted:** `99-cross-cutting/16-offline-queue.md`, `14-caching.md`, `22-pwa.md`, `15-realtime.md`, `03-data-model-plants.md`; two code investigations (read/caching side + write-path/gating side, file:line evidence in session).

## What exists today (verified)

- **Write queue** (`src/lib/offlineQueue.ts`): localStorage queue with per-item retry, capped exponential backoff, dead-lettering, cross-tab sync, per-user JWT safety, auto-flush on `online`/boot. Kinds: `task-status` (wired), `task-postpone`/`journal-add`/`ailment-link` (defined; producers partially wired). Solid foundation.
- **Read caches**: Dashboard (`dashboardCache`, 24h) and Shed (`useCachedShed`, ∞) paint offline. Quick-launcher pins cached. Weather re-derives from a cached raw snapshot.
- **UI**: `OfflineBadge` (tiny "Offline" chip), `QueuedActionsBadge` (count + manual flush). Avatar dropdown (`UserProfileDropdown`) has a "Check for update" item — the exact pattern for "Sync now".

## The blockers (verified)

1. **The app does not boot offline.** On launch it restores the session but then fetches `user_profiles`; offline that fails and after an 8s timeout the user hits an error screen. Nothing else offline matters until this is fixed. **Keystone.**
2. **Most screens have no offline read cache.** Planner/Schedule, Journal, Watchlist, Layout, Automations/Integrations all fetch-on-mount → blank/spinner offline. You can't act on data you can't see.
3. **No gating.** ~30 internet-only features (all AI, plant search/library, weather refresh, image uploads, integrations pairing, invites, export) fail silently/confusingly offline instead of telling you.
4. **Only 1 write is truly offline-capable.** ~50 user writes exist; the queue meaningfully covers ~1. Extending by 50 bespoke kinds by hand is unmaintainable — see architecture below.

## Architecture decisions

- **Reads = per-screen localStorage snapshots** (the proven dashboard/shed pattern): instant paint from cache, background revalidate, ∞ or long TTL (stale-but-visible beats blank). Optimistic updates so offline writes appear immediately.
- **Writes = a GENERIC single-row queue kind + a few bespoke composites.** Instead of 50 hand-written kinds, one `db-write` kind stores `{ table, op: insert|update|delete, payload, match }` and a generic executor replays it; RLS enforces safety server-side. This collapses the ~35 "easy" single-row idempotent ops (task create/edit, plant edit/archive, instance edit, notes, shopping, areas/locations edit, **garden shapes add/move/resize/delete**, todos, lux). Bespoke kinds stay for the few multi-row/ordered ops.
- **The genuinely hard ops** are inserts whose new **integer** id other rows reference (add-manual-plant = `plants` + `inventory_items`; add-from-catalogue = +schedules +ack) and automations (nested `trigger_logic` + actions), plus destructive cascades (delete location/plant). Offline integer-PK inserts need either client-temp-id remapping on replay or staying online-gated. **Recommendation:** ship these as online-gated first (clear "adding a plant needs a connection" message) and only invest in offline insert-remapping if you want it — it's the risky 20%.
- **Gating = one reusable guard.** `useOnline()` hook (already the pattern in `QueuedActionsBadge` via `useSyncExternalStore`) + `requireOnline(label): boolean` that toasts "You're offline — {label} needs a connection" and returns false. Applied at the ~30 curated entry points (not all 95 invoke sites — background calls like `sync-weather` on boot just fail quietly).

## Phased delivery (each phase independently shippable)

**Phase 0 — Boot & sync spine (keystone, small).**
- Cache `user_profiles` (+ the user's home list) on successful load; on boot, if the live fetch fails but a cached profile exists, hydrate from it (stale flag) and proceed instead of erroring.
- Global **offline banner** (upgrade the tiny chip to a clear dismissible top strip: "You're offline — you can keep working; changes sync when you reconnect").
- **"Sync now"** item in the avatar dropdown (modelled on "Check for update"): flushes the write queue AND refetches the active screen's data; spinner + result toast.
- On reconnect: already auto-flushes writes; also trigger a read-revalidate. This phase alone makes the app *open and stay usable* offline.

**Phase 1 — Gating (honesty, low risk, high value).**
- `useOnline()` + `requireOnline()`; apply at the ~30 internet-only entry points (AI: Plant Doctor, Garden AI chat, care-guide generate/refresh, planner AI, area optimise, weekly overview, seasonal picks, head-gardener; plant search/library/add-from-catalogue; weather refresh; image uploads; integrations pairing; invites; export). Consistent "needs a connection" toast/inline state.

**Phase 2 — Offline reads for the named screens.**
- Snapshot caches (dashboard/shed pattern) for: tasks/schedule, journal, watchlist, garden layout (shapes + areas), automations/devices (read-only view offline). Now every screen the user named opens offline with real data.

**Phase 3 — Offline writes (the core ask).**
- Generic `db-write` queue kind + producers for the ~35 easy ops. Optimistic cache updates (depends on Phase 2) so offline edits show instantly. Bespoke kinds for the medium set: yield-log (record + auto-journal), note+links, automation create/update.
- Covers: complete/uncomplete/add/edit/postpone tasks, add note, add journal, watchlist link, edit plant/instance, lifecycle complete, shopping, areas/locations edit, **garden layout shape edits**, todos.

**Phase 4 — Hard writes (considered follow-up / product call).**
- Add-manual-plant, add-from-catalogue (integer-PK insert remapping), destructive cascades. Recommendation: keep online-gated (Phase 1) until/unless you want the offline-insert investment. Flag explicitly so it's a decision, not a silent gap.

## Cross-cutting

- **Tests:** unit for the generic queue executor + `requireOnline`; Vitest for each new cache hook; Playwright offline-context specs (open each screen offline → data visible; write offline → queued → reconnect → synced; internet-only action offline → blocked toast). Playwright supports `context.setOffline(true)`.
- **Docs:** rewrite `16-offline-queue.md` (generic kind), `14-caching.md` (new snapshots), `22-pwa.md`; per-surface app-reference "offline behaviour" notes; `12-notifications`/badges.
- **Risks:** optimistic-update divergence (server authoritative — reconcile on revalidate); localStorage quota (snapshots are 10–100KB/home, within ~5MB — monitor layout/journal image refs, store URLs not blobs); replay ordering (queue is FIFO; bespoke composites keep their internal order).

## Decision (2026-07-08)

User chose the **full core (Phases 0–3) AND the hard offline inserts (Phase 4)** — the complete offline story including offline add-manual-plant and add-automation via client temp-id + remap-on-sync. Delivered phase by phase, each deployed and live-verified before the next (established session rhythm). Phase 0 first (keystone), then 1→4.

**Phase 4 approach (offline inserts):** client generates a negative/UUID temp id for the new row, the read cache shows it immediately, and on flush the queue inserts server-side, captures the real id, and remaps every queued item + cache reference that pointed at the temp id (FIFO replay makes dependent inserts resolvable). Integer-PK tables (plants) use a client temp id in a reserved negative range; uuid-PK tables generate a real uuid client-side (no remap needed).

## Delivered (2026-07-08)

All five phases shipped and live-verified, one deploy each.

- **Phase 0** — profile-cache boot-from-cache, `OfflineBanner`, user-menu "Sync now", reconnect auto-refetch, chunk-error offline guard. (keystone)
- **Phase 1** — `requireOnline()` gates on every internet-only action (AI chat, Plant Lens, plant/AI care refresh, task-from-photo, plant search).
- **Phase 2** — per-screen snapshot read caches (home switcher, watchlist, planner, journal, automations, layouts) + `lazyWithRetry` so routes render offline.
- **Phase 3** — **OS 35.0039.** Generic `db-write` queue kind (insert-as-upsert / update / delete) + `queuedWrite.ts` helpers. Producers: Notes full CRUD (optimistic + snapshot), garden-layout shape save, one-off task create. Verified offline→reconnect round-trips against a real DB; 5 unit tests.
- **Phase 4** — **OS 35.0040.** Offline add-manual-plant: **no temp-id remap needed** — plant integer ids are already client-generated (`generatePlantId`), so `saveToShed` just queues the plant + its seasonal `plant_schedules` (client uuids), deriving hemisphere from the cached home latitude; `TheShed` dup-checks the cached list and paints via `optimisticAddPlant`. Verified end-to-end (1 plant + 4 schedules queued → flush → persisted); 3 unit tests.

**Product calls made:**
- **Automations kept online-gated** (not queued): they drive live valve hardware and reference paired devices, so an offline config can't be validated or fire. `AutomationBuilderModal.save` uses `requireOnline` for a clear message. This matches this plan's own Phase 4 recommendation.
- **Destructive cascades kept online-only** (inventory/journal/task fan-out can't be previewed offline).
- **Offline-created one-off tasks** sync on reconnect but don't paint instantly in every task view — the `TaskEngine` list cache is in-memory, so cross-view optimistic injection was out of scope; the save toast says so.

Canonical mechanics doc: [`99-cross-cutting/16-offline-queue.md`](../app-reference/99-cross-cutting/16-offline-queue.md).
