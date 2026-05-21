# Phase 2 — Task list performance (Quick Access)

Companion to Phase 1 (`/quick/calendar` frost-date direct read + UI polish) which shipped in commit be79dce / 9a2686e / cea7cbc.

## Goal

Make `TaskList` feel snappy in two distinct moments:

1. **First visit per session** — show the list as soon as Round 1 of the fetch resolves (~150ms) instead of waiting for Round 2 + 3 (~400-700ms total). The plant thumbnails and dependency badges fill in afterwards. Eyeball perception: list appears almost instantly.
2. **Return visits within ~60s** — show the previous result immediately from an in-memory cache, then revalidate in the background. Perception: instant.

Both moments are independent — the cache helps return visits, incremental render helps first visits. Implementing both together because they overlap in `TaskList.tsx`'s fetch lifecycle.

## App-reference files consulted

- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — confirms ghost-task materialisation rules + the three rounds of queries.
- [02-dashboard/10-localized-task-calendar.md](../app-reference/02-dashboard/10-localized-task-calendar.md) — the surface that prompted this work.

Source files studied:
- [src/lib/taskEngine.ts](../../src/lib/taskEngine.ts) (214 lines) — `fetchTasksWithGhosts` orchestrates the three rounds:
  - Round 1 (parallel): tasks + blueprints + skipped-tombstones
  - Round 2 (parallel): inventory items + task_dependencies (needs ids from Round 1)
  - Round 3 (sequential, conditional): pending-parent lookups when deps exist
- [src/components/TaskList.tsx](../../src/components/TaskList.tsx) (1598 lines) — single consumer of `fetchTasksWithGhosts`, manages `tasks` / `inventoryDict` / `blockedTaskIds` state.
- Other consumers of `<TaskList />`: `HomeDashboard.tsx`, `TaskCalendar.tsx`, `LocationPage.tsx`, `LocalizedTaskCalendar.tsx`.

## Two-part plan

### Part A — Stale-while-revalidate cache

A module-level `Map` in `taskEngine.ts` keyed on the fetch's full input signature:

```ts
const CACHE_TTL_MS = 60_000; // 60s

interface CacheEntry {
  full: FullResult;     // tasks + inventoryDict + blockedTaskIds + bps
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey({ homeId, areaId, inventoryItemId, planId, startDateStr, endDateStr, includeOverdue, todayStr }) {
  return [homeId, areaId ?? '', inventoryItemId ?? '', planId ?? '', startDateStr, endDateStr, !!includeOverdue, todayStr].join('|');
}

// Public surface
TaskEngine.peekCache(args): CacheEntry | null  // synchronous read, ignores TTL
TaskEngine.invalidateCache(homeId?): void      // clear all or one home
```

`fetchTasksWithGhosts` writes to the cache on every success. `TaskList` reads from `peekCache` on mount and uses the cached data as the **initial state** (skipping the loading skeleton). It then fires `fetchTasksWithGhosts` in the background; when it resolves with fresh data, state updates and the UI re-renders.

Existing `useHomeRealtime` subscription stays — when the realtime channel fires, we already call `fetchTasksAndGhosts` which will refresh the cache.

### Part B — Incremental render via `onTasksReady` callback

Add an optional callback to `fetchTasksWithGhosts`:

```ts
type Phase1Snapshot = {
  tasks: AnyTask[];          // materialized list, including ghosts
  blueprints: Blueprint[];
  // inventoryDict + blockedTaskIds NOT yet populated
};

interface FetchOpts {
  homeId: string;
  startDateStr: string;
  endDateStr: string;
  includeOverdue?: boolean;
  todayStr: string;
  // NEW — fires after Round 1 + materialisation, before Rounds 2-3
  onTasksReady?: (snapshot: Phase1Snapshot) => void;
}
```

`TaskList.fetchTasksAndGhosts` becomes:

```ts
const fetchTasksAndGhosts = useCallback(async (silent = false) => {
  // Hydrate from cache if fresh — initial paint is INSTANT on return visits.
  const cached = TaskEngine.peekCache({ ...args });
  if (cached) {
    setTasks(cached.tasks);
    setInventoryDict(cached.inventoryDict);
    setBlockedTaskIds(cached.blockedTaskIds);
    setLoading(false);
    // continue to revalidate below
  } else if (!silent) {
    setLoading(true);
  }

  try {
    await TaskEngine.fetchTasksWithGhosts({
      ...args,
      onTasksReady: (phase1) => {
        // Render the list as soon as primary data lands.
        setTasks(phase1.tasks);
        setLoading(false);
      },
    }).then((full) => {
      setTasks(full.tasks);
      setInventoryDict(full.inventoryDict);
      setBlockedTaskIds(full.blockedTaskIds);
    });
  } catch (err) {
    // existing error handling
  }
}, [args]);
```

So the user sees:
- **Cache hit**: instant paint of cached list. Background revalidation may swap to fresh data.
- **Cache miss, first paint** (~150ms): list appears with titles, types, dates. Plant thumbnails show as plain icons; no dependency badges.
- **~300ms later**: thumbnails fade in, dependency badges appear, blocked-task styling renders.

### What gracefully degrades during the enrichment gap

`inventoryDict` is empty → tasks don't show a plant thumbnail next to the title (component already handles this — `inventoryDict[id]?.thumbnail_url` is `undefined`).

`blockedTaskIds` is empty → tasks render without the "blocked" treatment. Briefly. Re-renders once Round 2 + 3 resolve.

The visual flicker is small. We can ease it with a 150ms fade-in on the enrichment if it feels too jumpy.

## File touch list

| File | Status | Change |
|---|---|---|
| `src/lib/taskEngine.ts` | edit | Add cache (Map + helpers + TTL), add `onTasksReady` callback, write to cache on success |
| `src/components/TaskList.tsx` | edit | Read cache on mount, hand the callback into the engine, render incrementally |
| `tests/unit/lib/taskEngine.test.ts` | **NEW** | Cache hit/miss/expiry + `onTasksReady` callback firing order |

Existing other consumers (`HomeDashboard`, `TaskCalendar`, `LocationPage`, `LocalizedTaskCalendar`) don't need to change — they mount `<TaskList />` which handles its own fetching. The cache helps them all automatically.

## What stays the same

- The 3-round query architecture is unchanged. Same RLS, same realtime channels, same `useHomeRealtime`-triggered refresh, same materialisation logic for ghost tasks.
- Public `TaskEngine.fetchTasksWithGhosts` signature is backwards-compatible — `onTasksReady` is optional.
- Failure modes (Round 1 fails, Round 2 fails, etc.) keep their current toast/Sentry treatment.
- The realtime subscription stays. When a task changes elsewhere in the app, `TaskList` re-fetches and the cache rolls forward.

## Cache invalidation

Three paths invalidate the cache:
1. **Successful fetch** — writes its own fresh entry, overwriting any stale one.
2. **TTL expiry** — `peekCache` returns null when `now - fetchedAt > 60s`. Next mount triggers a fresh fetch (no instant hydrate).
3. **Realtime tick** — `useHomeRealtime("tasks", refresh)` already fires `refresh()` on every relevant change; we invalidate the cache for that home and re-fetch.

The 60s TTL is a defensive ceiling — most cache misses come from realtime invalidation, not TTL expiry.

## Tests

| Tier | What |
|---|---|
| Vitest (lib) | `TaskEngine.peekCache` — returns null on miss; returns entry on hit; returns null when older than TTL; `invalidateCache(homeId)` clears matching entries; bare `invalidateCache()` clears all. |
| Vitest (lib) | `onTasksReady` callback — fires once after Round 1 with the materialised list; full result still resolves with inventory+deps populated. |
| Vitest (component) | (Optional, scoped) — mock TaskEngine, render TaskList with a primed cache, assert no loading state on initial paint, assert enrichment swap. TaskList is large + tangled so the cost/benefit is borderline. Will defer unless a regression shows up in manual testing. |

I'll also add a smoke test that the existing 4 TaskList consumers (`HomeDashboard`, `TaskCalendar`, `LocationPage`, `LocalizedTaskCalendar`) still mount without errors after the `taskEngine` edits — there's no shared mock surface today so this is really just "type-check + manual exercise of the surfaces".

## Data-safety audit

| Change | Risk |
|---|---|
| Module-level cache Map | None — pure in-memory cache; no DB writes. Cleared on hard refresh / tab close. |
| `onTasksReady` callback (optional) | None — current call sites pass no callback, behaviour identical. |
| Reading cached data as initial state | The cached data is OUR OWN previous fetch; never reading data from a different user or home (the key includes `homeId`). |
| Realtime invalidation | Already happens via `useHomeRealtime`; cache simply discards on next fetch. |
| No DB writes, no edge fn changes, no migrations | — |

## Performance expectations

Typical home with ~20 active tasks, ~8 blueprints, ~15 inventory items:

| Scenario | Before | After |
|---|---:|---:|
| First visit per session, cache empty | ~600ms to fully-rendered | ~150ms to list visible, ~600ms to enriched |
| Return visit within 60s | ~600ms (re-fetched cold) | <50ms instant paint, ~600ms background revalidate |
| Realtime tick (someone completes a task elsewhere) | ~600ms to refresh | Same — realtime invalidates cache first |

The 150ms first-paint figure is dominated by network roundtrip to Supabase for Round 1. There's no further compression we can do at the architecture level without backend changes (e.g. an RPC that returns the full result in one query — that's a Phase 3 candidate, not Phase 2).

## Implementation order

1. Add cache + `onTasksReady` callback to `taskEngine.ts`.
2. Add Vitest for the new TaskEngine behaviours.
3. Wire `TaskList.tsx` to read the cache + use the callback.
4. Type-check + full Vitest sweep.
5. Manual test:
   - Open `/quick/calendar` first time — list should paint within ~150ms (titles), enrich within ~500ms (thumbnails + blocked badges).
   - Navigate to `/quick` then back to `/quick/calendar` within 60s — list should paint instantly.
   - Complete a task elsewhere (Dashboard) — return to `/quick/calendar`, see the completed task reflected.
   - Wait > 60s, return — fresh fetch, no instant paint.
6. Commit with `[skip ci]` and `npm run deploy`.

## What this wave doesn't do

- **No backend RPC** to collapse the 3 rounds into 1. That would be a bigger change (new SECURITY DEFINER function, new RLS testing) — Phase 3 candidate if Phase 2 doesn't move the perception needle enough.
- **No prefetch on Quick tile tap.** Could fire `fetchTasksWithGhosts({ ... })` in the background when the user *taps* the Today tile, so by the time `LocalizedTaskCalendar` mounts the data is already in cache. Saves another ~100ms. Worth doing as a follow-up if the main change isn't enough.
- **No skeleton refinement.** Existing skeleton stays for cache-miss cases.
- **No TaskList API breaking changes.** Drop-in replacement for every existing consumer.

## Locked decisions

| Question | Decision |
|---|---|
| Cache scope | Module-level `Map` in `taskEngine.ts` — shared across all `<TaskList />` instances on the page |
| TTL | 60 seconds — defensive ceiling; realtime ticks invalidate sooner in practice |
| Invalidation | Three paths: successful fetch overwrites, TTL expiry, realtime tick calls `TaskEngine.invalidateCache(homeId)` |
| Public API change | Additive only — `onTasksReady` optional, existing call sites unaffected |
| Other consumers | No code changes required; they all benefit from the cache automatically |

## Open questions

- **Cache TTL = 60s, or longer?** Realtime ticks invalidate sooner in practice, so 60s is more of a safety net than a primary lever. Tempted to bump to 5 minutes for the "I just opened the app from the home screen and immediately tapped Today" case. I'd lean 60s for now (matches stale-while-revalidate conventions; conservative). Flag if you'd prefer longer.
- **Add the prefetch-on-tile-tap optimisation** in the same wave, or save it for Phase 3? I'd save it — keeps Phase 2 scope tight, lets us measure the impact of just the cache + incremental render first.
