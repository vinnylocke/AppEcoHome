# Plan — Update banner reliability + auto-reload

## Symptoms

> "Sometimes the update app button just doesn't show and I have to keep closing the app and re opening, this also leads to the new version notes still showing when the app hasn't been updated yet."

> "Likewise with the maintenance page when that comes off you still have to update the app using the button that appears it's not automatic and if it is the button shouldn't appear."

## Root causes

Two things conspire:

1. **The DB-version check only fires once.** `useAppVersion` reads `/build-version.json` and the `app_config.app_version` row on mount, then never again. If the user has the tab open through a deploy, no second check happens — so the "update available" event never fires from this hook. The SW path *should* still fire it via `onNeedRefresh`, but on iOS Safari and other quirky PWA hosts the SW sometimes misses the new bundle until a hard close.

2. **The release-notes effect doesn't gate on `updateAvailable`.** If lastSeen got desynced by an earlier broken deploy, the effect can still fire release notes for a version the user isn't running — they see "what's new in 12.0013" while still on 12.0011.

The user's expectation is reasonable: either auto-reload (so they never have to look for a button) OR a reliable button. Right now we have intermittent button + intermittent silent reload.

## Fix

### 1. Poll the DB version

`useAppVersion` becomes a poller:
- Read DB version on mount (existing behaviour).
- Re-read on `visibilitychange` when the tab becomes visible.
- Re-read on a `setInterval` of 60 seconds while the tab is visible (cleared when hidden).
- Wrap the DB read in try/catch so transient errors don't kill the state — keep the last good value, retry next tick.

### 2. UpdateBanner — 10-second auto-reload countdown

Change the banner from "show button, wait for click" to:
- Banner appears immediately when `pwa-update-available` fires.
- Displays "Reloading in 10s" with a progress dot countdown.
- A small **Not now** button cancels the countdown (banner stays visible with a `Reload now` button).
- If the user does nothing, it auto-reloads at 0.

This gives reliable updating without taking control away — anyone mid-task can cancel and choose their moment.

### 3. Gate release notes by `updateAvailable`

The release-notes effect already keys off `bundleVersionKey`, but if the user's `localStorage.rhozly_last_seen_version` got desynced by an earlier broken deploy, it can still fire spuriously. Add a guard: when `versionState.updateAvailable === true`, skip the effect entirely. The user is about to update; show the notes *after* they're on the new bundle, not while they're still on the old one.

### 4. Ensure dispatch on subsequent polls

When the new poller spots a version mismatch, dispatch the same `pwa-update-available` event the SW dispatches. The UpdateBanner ignores duplicate dispatches (already mounted). The release-notes guard handles the "stop showing notes" case.

## Files

- `src/hooks/useAppVersion.ts` — add polling + retry; dispatch event on mismatch from this hook too.
- `src/components/UpdateBanner.tsx` — add 10-second countdown + Not now + Reload now flow.
- `src/App.tsx` — gate release-notes effect by `!versionState.updateAvailable`.

## Out of scope

- Switching to a full background-only auto-reload with no banner. Some users will be mid-task and need the chance to cancel — the countdown is a friendlier middle ground.
- Re-issuing the localStorage `rhozly_last_seen_version` key. Existing desynced values self-correct once the user reaches the new bundle.

## Risk

- A user filling out a long form gets auto-reloaded after 10s. Mitigated by the countdown + Not now button.
- Polling burns one tiny query per minute against `app_config`. ~60 queries/hour/user — well within budget.
