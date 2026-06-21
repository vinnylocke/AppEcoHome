# Service-worker update reliability + `sw.js load failed` noise

## Problem

Installed PWAs lag behind deploys (stale bundle → blank What's New, old code), and Sentry
`RHOZLY-W: "Script https://rhozly.com/sw.js load failed"` fires on iOS Safari (unhandled
rejection, iOS 18.7).

## Root causes

`src/main.tsx` registers the SW with `registerSW({ immediate, onNeedRefresh, onOfflineReady })`
(`registerType: "prompt"`):

1. **No periodic update check.** The SW only re-checks for a new version on
   navigation/relaunch. An installed PWA that's resumed (not fully relaunched) doesn't
   proactively fetch + install the new SW, so the "Reload" prompt never appears until later.
2. **No `onRegisterError`.** When the SW script fetch fails (transient iOS Safari "Load
   failed" — offline / backgrounded mid-fetch), the registration promise rejects **unhandled**
   → Sentry `RHOZLY-W`. Only 2 occurrences, 0 users — benign noise, but it masks signal.

(Note: `build-version.json` is NOT precached — it's NetworkFirst — so the DB-version poll in
`useAppVersion` already drives the update banner. The missing piece is the SW proactively
installing the waiting worker so the banner's reload actually activates it.)

## Fix (`src/main.tsx`)

1. **`onRegisteredSW(_url, registration)`** — call `registration.update()` (wrapped in
   `.catch()`) on `visibilitychange→visible`, `focus`, and hourly while open. Installed PWAs
   then pick up a deploy on resume → SW installs the waiting worker → `onNeedRefresh` →
   UpdateBanner → reload activates it.
2. **`onRegisterError(err)`** — handle the registration/update failure (console.warn) so it
   no longer becomes an unhandled rejection.
3. **Sentry `beforeSend`** — drop the transient `sw.js … load failed` rejection (belt-and-
   suspenders for any path the lib doesn't catch). Specific match so real chunk-load failures
   (handled separately by `handleChunkError` → reload) are unaffected.

## Risks

- `registration.update()` is cheap (HTTP revalidation of the SW script) and error-guarded —
  no reload loop, no unhandled rejections. `skipWaiting` stays omitted, so updates still wait
  for the user's "Reload" tap (no mid-session white screen).

## Verify

`npm run build`. Behaviour: after a deploy, reopening the installed app should surface the
update prompt promptly; Sentry should stop logging `sw.js load failed`.
