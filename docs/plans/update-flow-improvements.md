# Update Flow Improvements

## Problems reported

1. **Updates not detected on resume.** App minimised for a long time, then re-opened → doesn't register that an update is available. User has to fully close + relaunch + wait before the banner appears.
2. **10s countdown + cancellable.** Update banner counts down 10s with a "Not now" and "Dismiss" button — both should go. Updates should be mandatory.
3. **Stale release notes shown on out-of-date bundle.** Tapping "What's new" while still on the old bundle shows the *latest deployed* release notes (which the user hasn't actually received yet). Should only show notes for the version they're actually running and below.

## Investigation

### Update detection (Issue 1)

`src/hooks/useAppVersion.ts` polls the `app_config.app_version` DB row. Current refresh triggers:

- Initial mount
- `document.visibilitychange` → "visible"
- `window.online`
- 60-second interval while tab is visible

**Why resume often misses it on Capacitor / mobile PWAs:**
- Capacitor native shell: `visibilitychange` does not always fire when the OS swaps the app back from background. Capacitor exposes its own `App.addListener('appStateChange', …)` event for this.
- Browser PWAs: `visibilitychange` does fire, but if the network is briefly unavailable on resume the supabase call fails, and the next poll isn't for 60s.
- `pageshow` (back-forward cache restore) is not handled — Safari restoring a tab from BFCache won't trigger any of the existing listeners.

### Update banner (Issue 2)

`src/components/UpdateBanner.tsx`:
- `COUNTDOWN_SECONDS = 10`
- "Not now" button cancels the countdown and reveals a "Reload now" button.
- "Dismiss" (X) hides the banner for the session.

Both let the user keep using the stale bundle indefinitely.

### Release notes gating (Issue 3)

`src/hooks/useReleaseNotes.ts` fetches **all** rows from `release_notes` ordered by `released_at desc`. The deploy pipeline writes a new row to that table **before** the bundle finishes rolling out to clients. So:

- User on bundle v1.0021. DB has rows for v1.0021, v1.0022, v1.0023.
- They tap "What's new" → modal opens, shows v1.0023 (the row at `notes[0]`).
- The user hasn't actually received v1.0023's changes yet — those bullets describe code they don't have.

The auto-popup logic (`src/App.tsx:287-300`) does gate on `!updateAvailable`, but the manual menu-driven path through the dropdown passes the unfiltered list straight to the modal.

## App-reference files consulted

- [`docs/app-reference/99-cross-cutting/32-release-notes.md`](docs/app-reference/99-cross-cutting/32-release-notes.md) — pipeline + ordering of writes vs deploy.
- [`docs/app-reference/99-cross-cutting/31-deployment.md`](docs/app-reference/99-cross-cutting/31-deployment.md) — confirms release_notes row is written by `scripts/deploy.mjs` step 6, after the Vercel deploy.
- [`docs/app-reference/99-cross-cutting/23-capacitor.md`](docs/app-reference/99-cross-cutting/23-capacitor.md) — Capacitor App API patterns already in use.

## Approach

### Fix 1 — Resume detection

Edit `src/hooks/useAppVersion.ts`:

1. Add `window.focus` as a refresh trigger (catches browser foreground without a tab-switch).
2. Add `pageshow` (catches BFCache restore on Safari).
3. Add Capacitor `App.addListener('appStateChange', state => state.isActive && refresh())` — gated behind a `Capacitor.isNativePlatform()` check so it's a no-op on web. Use a dynamic `import('@capacitor/app')` so the web build doesn't pull in the native plugin.
4. Reduce `POLL_INTERVAL_MS` from 60_000 → 30_000.
5. Add a small in-flight guard (skip a refresh if one is already running) so the new triggers don't pile up.

Net effect: every realistic resume path now fires a fresh DB check inside a couple of seconds.

### Fix 2 — Mandatory update banner

Edit `src/components/UpdateBanner.tsx`:

1. Drop `COUNTDOWN_SECONDS` from 10 → **3**.
2. Remove the "Not now" button entirely.
3. Remove the "Dismiss" (X) button entirely.
4. Remove the `cancelled` state and the "Reload now" branch.
5. Banner copy: "**Updating Rhozly OS…**" with subline "Applying the latest version in {countdown}s." Progress bar stays.
6. Once the countdown hits 0, the reload fn fires unconditionally.

This makes updates non-cancellable while still giving 3 seconds of "we're about to reload" feedback so it's not jarring.

### Fix 3 — Filter release notes to running bundle

The cleanest place to fix this is in the modal's caller, not the hook (other surfaces — e.g. the dropdown showing "currently running" — may need the full list later).

Edit `src/App.tsx` where `ReleaseNotesModal` is rendered (line 1768):

```tsx
const bundleVersionKey = versionState.bundleVersionKey;
const filteredReleaseNotes = useMemo(() => {
  if (!bundleVersionKey) return [];
  const [bMajor, bMinor] = bundleVersionKey.split(".").map(Number);
  return allReleaseNotes.filter(n =>
    n.major < bMajor || (n.major === bMajor && n.minor <= bMinor)
  );
}, [allReleaseNotes, bundleVersionKey]);
```

Pass `filteredReleaseNotes` to `ReleaseNotesModal` instead of `allReleaseNotes`. Net effect: the modal's `notes[0]` is now the latest version the user is actually *running*, and "View all versions" only goes back through their actual upgrade history.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Countdown duration | **3 seconds** — long enough to register, short enough to feel mandatory. Could go to 0 but a brief beat avoids the page-just-disappeared startle. |
| Keep the banner visually identical otherwise? | **Yes** — same colours / position. Only the buttons disappear and the copy changes. |
| Native bridge import strategy | **Dynamic `import('@capacitor/app')` gated on `Capacitor.isNativePlatform()`** — keeps web bundle size unchanged. |
| What if Capacitor plugin isn't installed? | The dynamic import fails silently inside a try/catch; the rest of the listeners still work. |
| Poll interval | **30s** (halved from 60s). More aggressive than necessary but cheap — single tiny supabase call. |
| Filter release notes inside the hook? | **No** — keep `useReleaseNotes()` returning the full list (`UserProfileDropdown` may want to render "Latest available: vX.X" in future). Filter at the call site instead. |

## Files

| File | Change |
|---|---|
| `src/hooks/useAppVersion.ts` | Add focus / pageshow / Capacitor appStateChange triggers; drop poll interval to 30s; in-flight guard. |
| `src/components/UpdateBanner.tsx` | Remove "Not now" + "Dismiss"; drop countdown to 3s; update copy. |
| `src/App.tsx` | Filter `allReleaseNotes` to ≤ `bundleVersionKey` before passing to `ReleaseNotesModal`. |
| `docs/app-reference/99-cross-cutting/32-release-notes.md` | Update Role 1 to document that the modal filters by bundle, not by DB latest. |
| `docs/app-reference/99-cross-cutting/22-pwa.md` | (If present) Update to document the new resume-detection triggers and the non-cancellable banner. |

## Steps

1. `src/hooks/useAppVersion.ts` — add new refresh triggers, in-flight guard, shorter interval.
2. `src/components/UpdateBanner.tsx` — strip cancel paths, shorten countdown, update copy.
3. `src/App.tsx` — add `useMemo` filtering of release notes.
4. Update app-reference docs.
5. Typecheck + unit tests + deploy.
