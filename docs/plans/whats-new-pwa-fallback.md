# "What's New" blank on PWA — DB-version fallback

## Problem

Installed-PWA users sometimes saw no "What's New" in the profile dropdown. The dropdown
item + release-notes history are keyed to the **bundle** version (`build-version.json`). On a
PWA, the service worker can serve a stale bundle or `build-version.json` can fail to load
(see Sentry `RHOZLY-W: sw.js load failed`), leaving the version `null` / `"00.0000"` sentinel:
`UserProfileDropdown` early-returns (no item) and `filteredReleaseNotes` filters to empty
(blank modal).

## Fix (`src/App.tsx`)

When the bundle version is unknown/sentinel, fall back to the **DB version** for the *manual*
What's New:
- `resolvedVersionKey` = bundle key if valid & ≠ `00.0000`, else `dbVersionKey`.
- `appVersion` (drives the dropdown badge + error page) derives from `resolvedVersionKey`.
- `filteredReleaseNotes` filters against `resolvedVersionKey`.

The **auto-popup** stays strictly bundle-gated (skips the sentinel, suppressed while
`updateAvailable`) so we never auto-show notes for code the user hasn't actually received —
only the manual dropdown/history gains the fallback so it's never blank.

## Verify

`npm run build` (clean). Manual: with `build-version.json` unreachable, the dropdown should
show What's New and the history modal should populate from the DB version.
