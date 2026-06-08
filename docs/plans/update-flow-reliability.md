# Plan — Update / release-notes flow reliability

## User-reported symptoms

1. "Check for update" reports "You're on the latest version" — then ~1 second later the UpdateBanner appears and starts the update countdown.
2. Release notes show before the new version is actually applied.
3. Sometimes the app has to be closed and re-opened for the update to take effect.

## Root-cause analysis

Three independent bugs:

### Bug A — "Check for update" returns before the SW probe finishes

`useAppVersion.refresh()` runs in this order:
1. `await reg.update()` — triggers a SW probe. **Returns when the probe COMPLETES**, but a new SW that's been found is then installed asynchronously. `reg.installing` may be set when `update()` resolves.
2. `await fetchDbVersion()` — DB read.
3. Compare DB to bundle. Return `updateAvailable: isAhead`.

The DB check usually runs and resolves while the new SW is still installing. So we report "up to date" even though the SW is about to fire `onNeedRefresh` once installation finishes.

Fix: after `reg.update()`, also check `reg.waiting` (already-installed-and-waiting) and `reg.installing` (in flight). If either is set, treat the result as "update available" even when DB matches bundle.

### Bug B — UpdateBanner's reload doesn't always activate the waiting SW

The banner captures the FIRST `reload` fn from a `pwa-update-available` event. Two paths dispatch this event:
- The SW path (`main.tsx#onNeedRefresh`) → `reload: () => updateSW(true)` — this calls `skipWaiting` + `controllerchange` + reload. The CORRECT path.
- The `useAppVersion` polling path → `reload: () => window.location.reload()` — a NAIVE reload that doesn't activate the waiting SW.

If `useAppVersion`'s poll spots the version mismatch before the SW fires `onNeedRefresh`, the banner locks in the naive reload. The 3s countdown ends, page reloads onto the OLD SW (the waiting SW is still waiting), nothing changes. **User has to close and re-open the app** — at that point the SW's normal claim flow takes over.

Fix: `useAppVersion` should not pass a reload fn (or should pass a smarter one that probes for `reg.waiting` and calls `postMessage({ type: 'SKIP_WAITING' })` + `controllerchange` + reload). Cleanest: dispatch with no `reload`, and have the banner do its own SW-aware reload as a fallback.

### Bug C — Release notes can appear during the transition window

The release-notes effect:
```ts
if (versionState.updateAvailable) return;
if (lastSeen !== versionKey) setReleaseNotesMode("latest");
```

This gates on `updateAvailable`, which is DB-vs-bundle. During the deploy window — Vercel has the new bundle live, but the deploy script hasn't yet POSTed the DB version bump — a user who reloads will:
- Get the new bundle (bundleVersionKey = new)
- See `updateAvailable: false` (DB still old, so `db <= bundle`)
- Trigger the release-notes effect for the new version
- Read `release_notes` table — the new version's row may or may not be there yet

If the release_notes row IS there (race: DB bump happened JUST after the version bump but the user reloaded between them), they see new notes before the cycle finishes. If it's not there yet, the modal opens with the previous version's notes.

The current code partially mitigates this with `sessionStorage.setItem("rhozly_just_saw_release_notes", "true")` then in `main.tsx#onNeedRefresh` it suppresses the next SW dispatch. But the broader race remains.

Fix scope for this wave: leave Bug C alone unless the implementation of A and B reveals a simple piggy-back fix. The user's pain point is mostly A and B.

## Changes

| File | Change |
|------|--------|
| `src/hooks/useAppVersion.ts` | `refresh()` awaits the SW probe and treats `reg.waiting`/`reg.installing` as "update available". Polling dispatch passes no reload fn — the banner falls back to SW-aware reload. |
| `src/components/UpdateBanner.tsx` | Reload path becomes SW-aware: tries `reg.waiting.postMessage({ type: 'SKIP_WAITING' })` + `controllerchange` listener + reload; falls back to plain `window.location.reload()` if no SW. |

## Tests

No existing unit tests for either file. The fix is too intertwined with the browser SW API to mock cleanly — manual smoke-test post-deploy:
- Trigger a fresh deploy
- Tap "Check for update" → should NOT say "up to date" if an update is queued
- Wait for the banner → reload → confirm bundle version changes without close/reopen

## Deploy

Frontend only. Minor bump → 22.0014. No edge function or migration involved.

## Risks

- `reg.waiting` / `reg.installing` checks are safe-by-default. If something's wrong, worst case is the user sees an unnecessary "Update available — applying now…" toast when no update is actually queued. Acceptable.
- The SW-aware reload in UpdateBanner could in theory loop if `controllerchange` fires unexpectedly. Mitigated by a once-only guard.
